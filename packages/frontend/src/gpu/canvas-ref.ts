import { Context, Effect, Layer, Option, Ref, Scope } from 'effect'

/**
 * The live render canvas, registered by the canvas mount and read by render
 * commands — an explicit dependency instead of a global DOM query
 * (`document.getElementById`).
 *
 * The Ref is module-scoped rather than built per Layer instance: foldkit runs
 * mounts in the runtime's render context, which does not include the
 * `resources` layer (only Commands and Subscriptions are provided the built
 * services). The canvas mount writes the element and render commands read it,
 * so the Ref must live where both sides can reach it. It holds at most the
 * one mounted canvas and is cleared on unmount, so the module scope leaks
 * nothing between app sessions — a rebuilt Layer (test, HMR, a second app
 * instance) shares the same Ref and sees the same live canvas.
 */
export const canvasRef = Ref.makeUnsafe<Option.Option<HTMLCanvasElement>>(Option.none())

export class CanvasRef extends Context.Service<
  CanvasRef,
  Ref.Ref<Option.Option<HTMLCanvasElement>>
>()('CanvasRef') {}

export const CanvasRefLive = Layer.succeed(CanvasRef, canvasRef)

/**
 * Register a mounted canvas in the shared ref for the element's lifetime.
 * The release finalizer is registered on the mount fiber's scope, which
 * stays open for as long as the element is mounted: when the canvas unmounts
 * the runtime interrupts the mount fiber and the ref is cleared — unless a
 * newer canvas already replaced it (the release only clears when the ref
 * still points at this element).
 */
export const registerCanvas = (
  ref: Ref.Ref<Option.Option<HTMLCanvasElement>>,
  element: HTMLCanvasElement,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(Ref.set(ref, Option.some(element)), () =>
    Ref.get(ref).pipe(
      Effect.flatMap((current) =>
        Option.isSome(current) && current.value === element
          ? Ref.set(ref, Option.none())
          : Effect.void,
      ),
    ),
  )
