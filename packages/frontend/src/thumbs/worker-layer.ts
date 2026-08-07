import { Context, Deferred, Effect, Layer, Option, Ref } from 'effect'
import type { LutCube, LutId } from '@lutra/engine'
import type { LutThumbRequest, LutThumbResponse } from './worker'

/**
 * Worker-backed per-photo LUT thumbnail renderer (docs/adr/0013): the bar's
 * filmstrip previews — the user's photo with one LUT applied at full
 * strength — are rendered off the main thread by the CPU sampler, one worker
 * request per LUT. The worker is created once and terminated with the layer
 * (the same shape as `ImageEncoderWorkerLive`).
 *
 * `render` returns `Option.none()` instead of failing when the request was
 * skipped or the render failed: the bar silently keeps the vendored generic
 * preview in every non-success case, so the failure set has no consumer —
 * the command treats "no thumb" and "thumb" uniformly.
 */
export interface LutThumbnailerShape {
  /**
   * Render one 200×200 LUT preview: apply `cube` to `image` in the worker
   * and resolve with the JPEG bytes. `bitmap` is the photo the preview
   * belongs to — an in-flight dedupe key: a request for a lutId already
   * rendering for the SAME photo is skipped (`none`), while a request for
   * the same lutId on a NEW photo proceeds (the stale batch's results are
   * dropped by update's bitmap guard, never by the worker).
   */
  readonly render: (
    lutId: LutId,
    image: ImageData,
    cube: LutCube,
    bitmap: ImageBitmap,
  ) => Effect.Effect<Option.Option<Uint8Array>>
}

export class LutThumbnailer extends Context.Service<LutThumbnailer, LutThumbnailerShape>()(
  'LutThumbnailer',
) {}

export const LutThumbnailerLive = Layer.effect(
  LutThumbnailer,
  Effect.gen(function* () {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    yield* Effect.addFinalizer(() => Effect.sync(() => worker.terminate()))

    const pendingRef = yield* Ref.make<ReadonlyMap<number, Deferred.Deferred<Uint8Array, Error>>>(
      new Map(),
    )
    const nextIdRef = yield* Ref.make(0)
    // lutId -> the photo its in-flight render belongs to (the ImageBitmap
    // reference). Cleared by each request's completion path; a worker crash
    // clears it wholesale.
    const inFlightRef = yield* Ref.make(new Map<LutId, ImageBitmap>())

    const failAll = (message: string): Effect.Effect<void> =>
      Ref.getAndSet(pendingRef, new Map()).pipe(
        Effect.flatMap((pending) =>
          Effect.forEach(pending, ([, deferred]) => Deferred.fail(deferred, new Error(message)), {
            discard: true,
          }),
        ),
      )

    // Worker events fire outside the Effect runtime's stack — route through
    // the default runtime's background fork, like the encode worker's
    // onmessage handler.
    worker.onmessage = (event: MessageEvent<LutThumbResponse>) => {
      const { id, bytes, error } = event.data
      void Effect.runFork(
        Ref.getAndUpdate(pendingRef, (pending) => {
          const rest = new Map(pending)
          rest.delete(id)
          return rest
        }).pipe(
          Effect.flatMap((pending) => {
            const deferred = pending.get(id)
            if (!deferred) return Effect.void
            if (bytes) return Deferred.succeed(deferred, bytes)
            return Deferred.fail(deferred, new Error(error ?? 'LUT thumbnail failed'))
          }),
        ),
      )
    }
    worker.onerror = (event) => {
      void Effect.runFork(
        Ref.set(inFlightRef, new Map()).pipe(
          Effect.flatMap(() => failAll(event.message || 'Thumb worker crashed')),
        ),
      )
    }

    return LutThumbnailer.of({
      render: (lutId, image, cube, bitmap) =>
        Effect.gen(function* () {
          // Dedupe: register first, so a duplicate dispatch for the same
          // lutId + photo (a mid-batch tab switch-away-and-back) is skipped
          // instead of rendering twice. A NEW photo's request for the same
          // lutId is not deduped — the stale batch may still be running, but
          // its results are bitmap-guarded away by update.
          const before = yield* Ref.getAndUpdate(inFlightRef, (m) => {
            if (m.get(lutId) === bitmap) return m
            const next = new Map(m)
            next.set(lutId, bitmap)
            return next
          })
          if (before.get(lutId) === bitmap) return Option.none()

          const id = yield* Ref.getAndUpdate(nextIdRef, (n) => n + 1)
          const deferred = yield* Deferred.make<Uint8Array, Error>()
          yield* Ref.update(pendingRef, (pending) => new Map(pending).set(id, deferred))
          const request: LutThumbRequest = { id, image, cube }
          worker.postMessage(request)

          const result = yield* Deferred.await(deferred).pipe(Effect.option)
          // The slot is released on every completion path — success,
          // failure, or the worker crashing (the crash path already cleared
          // the map wholesale; the conditional remove is then a no-op). The
          // remove is conditional so a newer batch's registration for the
          // same lutId (a different photo) is never clobbered.
          yield* Ref.update(inFlightRef, (m) => {
            if (m.get(lutId) !== bitmap) return m
            const next = new Map(m)
            next.delete(lutId)
            return next
          })
          return result
        }),
    })
  }),
)
