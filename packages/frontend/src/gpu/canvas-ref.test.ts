import { describe, expect, it } from 'vitest'
import type { Scope } from 'effect'
import { Effect, Fiber, Option, Ref, Stream } from 'effect'
import { EditorMessage } from '../editor/message'
import { RegisterCanvas } from '../editor/canvas-stage'
import { canvasRef } from './canvas-ref'

// The runtime forks the mount's stream with the render context — which does
// NOT include the `resources` layer (only Commands and Subscriptions are
// provided the built services). These tests run the mount exactly that way:
// no CanvasRef service in context, stream forked and interrupted like the
// runtime's insert/destroy hooks do.

/** Fork the mount's stream like the runtime's insert hook and wait until the
 *  registration has landed in the shared ref. */
const mountCanvas = (element: Element): Effect.Effect<Fiber.Fiber<void>, never, Scope.Scope> =>
  Effect.gen(function* mountCanvas() {
    const fiber = yield* Effect.forkScoped(
      Stream.runForEach(RegisterCanvas().f(element), () => Effect.void),
    )
    let current: Option.Option<HTMLCanvasElement> = Option.none()
    for (let i = 0; i < 100; i++) {
      yield* Effect.yieldNow
      current = yield* Ref.get(canvasRef)
      if (Option.isSome(current) && current.value === element) {
        break
      }
    }
    return fiber
  })

describe('RegisterCanvas mount', () => {
  it('registers the mounted canvas into the shared ref without the CanvasRef service in context', async () => {
    const el = document.createElement('canvas')

    const registered = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* registered() {
          yield* mountCanvas(el)
          return yield* Ref.get(canvasRef)
        }),
      ),
    )

    // The mount context has no CanvasRef service (this was the regression:
    // `Effect.serviceOption(CanvasRef)` returned None and the registration
    // was silently skipped), yet the ref must hold the element so render
    // commands can resolve the canvas.
    expect(registered).toEqual(Option.some(el))
  })

  it('emits CanvasRegistered once the registration is in place', async () => {
    const el = document.createElement('canvas')

    const messages = await Effect.runPromise(
      Effect.scoped(
        Stream.runCollect(Stream.take(RegisterCanvas().f(el), 1)).pipe(
          Effect.map((chunk) => [...chunk]),
        ),
      ),
    )

    expect(messages).toEqual([EditorMessage.CanvasRegistered()])
  })

  it('clears the ref when the canvas unmounts', async () => {
    const el = document.createElement('canvas')

    const afterUnmount = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* afterUnmount() {
          const fiber = yield* mountCanvas(el)
          // Unmount: the runtime interrupts the mount's fiber, which closes
          // the mount scope and runs the registration's release finalizer.
          yield* Fiber.interrupt(fiber)
          return yield* Ref.get(canvasRef)
        }),
      ),
    )

    expect(afterUnmount).toEqual(Option.none())
  })

  it('does not clear a newer canvas when an older one unmounts', async () => {
    const first = document.createElement('canvas')
    const second = document.createElement('canvas')

    const afterFirstUnmount = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* afterFirstUnmount() {
          const firstFiber = yield* mountCanvas(first)
          // A newer canvas mounts and replaces the ref.
          const secondFiber = yield* mountCanvas(second)
          // The first canvas unmounts — the ref must keep pointing at the
          // newer canvas.
          yield* Fiber.interrupt(firstFiber)
          const current = yield* Ref.get(canvasRef)
          yield* Fiber.interrupt(secondFiber)
          return current
        }),
      ),
    )

    expect(afterFirstUnmount).toEqual(Option.some(second))
  })
})
