import { Context, Effect, Layer, Option, Ref } from 'effect'

/**
 * The live render canvas, registered by the canvas mount and read by
 * render commands — an explicit dependency instead of a global DOM query
 * (`document.getElementById`). The Ref is scoped to the service instance
 * and written on canvas mount/unmount, so the element's lifetime is the
 * registration's lifetime.
 */
export class CanvasRef extends Context.Service<
  CanvasRef,
  Ref.Ref<Option.Option<HTMLCanvasElement>>
>()('CanvasRef') {}

export const CanvasRefLive = Layer.effect(
  CanvasRef,
  Effect.gen(function* () {
    return yield* Ref.make<Option.Option<HTMLCanvasElement>>(Option.none())
  }),
)
