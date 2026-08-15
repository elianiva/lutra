import { Context, Deferred, Effect, Layer, Option, Ref } from 'effect'
import type { LutCube, LutId } from '@lutra/engine'
import { ThumbnailEncodeError } from '../errors'
import type { LutThumbRequest, LutThumbResponse } from './worker'

/**
 * Worker-pool-backed per-photo LUT thumbnail renderer (docs/adr/0013): the
 * bar's filmstrip previews — the user's photo with one LUT applied at full
 * strength — are rendered off the main thread by the CPU sampler. A group
 * is 30–68 LUTs and each render is a synchronous sample plus a wasm JPEG
 * encode, so a single worker would serialize the whole strip; the layer
 * instead keeps a pool of stateless workers and round-robins requests
 * across them. Each worker is a copy of the encode-worker shape (no state,
 * `{ id, image, cube }` in, `{ id, bytes }` out), so fan-out is N identical
 * posts. The workers are created once and terminated with the layer.
 *
 * `render` returns `Option.none()` instead of failing when the request was
 * skipped or the render failed: the bar silently keeps the vendored generic
 * preview in every non-success case, so the failure set has no consumer —
 * the command treats "no thumb" and "thumb" uniformly.
 */
export interface LutThumbnailerShape {
  /**
   * Render one 200×200 LUT preview: apply `cube` to the photo in a pool
   * worker and resolve with the JPEG bytes. The photo is downscaled to the
   * preview size here, once per photo — the layer caches the ImageData by
   * bitmap identity, so a group's concurrent commands share a single
   * canvas-2D op — and the shared buffer is structured-cloned into each
   * request. `bitmap` is also the photo the preview belongs to — an
   * in-flight dedupe key: a request for a lutId already rendering for the
   * SAME photo is skipped (`none`), while a request for the same lutId on a
   * NEW photo proceeds (the stale batch's results are dropped by update's
   * bitmap guard, never by the worker).
   */
  readonly render: (
    lutId: LutId,
    bitmap: ImageBitmap,
    cube: LutCube,
  ) => Effect.Effect<Option.Option<Uint8Array>>
}

export class LutThumbnailer extends Context.Service<LutThumbnailer, LutThumbnailerShape>()(
  'LutThumbnailer',
) {}

/**
 * The square size the per-photo filmstrip previews are rendered at. The
 * bar's thumbs are 96px CSS, so 200px keeps them sharp on 2× displays.
 */
const LUT_THUMB_SIZE = 200

/**
 * Downscale the source photo to the square preview: a center cover-crop
 * (scale to fill, crop the overflowing dimension from the center), matching
 * the bar's square `object-cover` presentation. Runs once per photo — the
 * layer caches its result by bitmap identity — so a group visit costs a
 * single ~2ms canvas-2D op instead of one per LUT. The resulting 160KB
 * ImageData is structured-cloned with each worker request (the same buffer
 * serves the whole pool, so it cannot be transferred).
 */
const thumbImageData = (bitmap: ImageBitmap): Effect.Effect<ImageData, ThumbnailEncodeError> =>
  Effect.tryPromise({
    try: async () => {
      const w = bitmap.width
      const h = bitmap.height
      const scale = Math.max(LUT_THUMB_SIZE / w, LUT_THUMB_SIZE / h)
      const sw = LUT_THUMB_SIZE / scale
      const sh = LUT_THUMB_SIZE / scale
      const canvas = new OffscreenCanvas(LUT_THUMB_SIZE, LUT_THUMB_SIZE)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new ThumbnailEncodeError({ message: '2d context unavailable' })
      ctx.drawImage(
        bitmap,
        (w - sw) / 2,
        (h - sh) / 2,
        sw,
        sh,
        0,
        0,
        LUT_THUMB_SIZE,
        LUT_THUMB_SIZE,
      )
      return ctx.getImageData(0, 0, LUT_THUMB_SIZE, LUT_THUMB_SIZE)
    },
    catch: (cause) =>
      cause instanceof ThumbnailEncodeError
        ? cause
        : new ThumbnailEncodeError({
            message: 'Failed to downscale the photo for LUT previews',
            cause,
          }),
  })

export const LutThumbnailerLive = Layer.effect(
  LutThumbnailer,
  Effect.gen(function* () {
    // The pool: 4 workers, or the machine's core count, whichever is lower
    // (a single-core machine degrades to the pre-pool one-worker behavior).
    // Each worker lazily instantiates its own jSquash wasm on first use;
    // the browser caches it after the first group.
    const poolSize = Math.min(4, Math.max(1, navigator.hardwareConcurrency ?? 2))
    const workers: Array<Worker> = []

    // id -> the Deferred awaiting it plus the worker serving it, so a
    // worker crash fails only its own requests. Cleared by each request's
    // completion path; a crash clears its worker's entries wholesale.
    const pendingRef = yield* Ref.make<
      ReadonlyMap<
        number,
        { readonly deferred: Deferred.Deferred<Uint8Array, Error>; readonly worker: number }
      >
    >(new Map())
    const nextIdRef = yield* Ref.make(0)
    // lutId -> the photo its in-flight render belongs to (the ImageBitmap
    // reference). Cleared by each request's completion path; a worker crash
    // clears it via the failing requests' cleanup, never wholesale.
    const inFlightRef = yield* Ref.make(new Map<LutId, ImageBitmap>())
    // The downscaled preview, cached per photo: one canvas-2D op per photo,
    // shared by every request of the group.
    const downscaleRef = yield* Ref.make<
      Option.Option<{ readonly bitmap: ImageBitmap; readonly image: ImageData }>
    >(Option.none())
    // Round-robin cursor across the pool.
    const roundRobinRef = yield* Ref.make(0)

    const spawn = (index: number): Worker => {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = onMessage
      worker.onerror = onError(index)
      return worker
    }

    // Worker events fire outside the Effect runtime's stack — route through
    // the default runtime's background fork, like the encode worker's
    // onmessage handler.
    const onMessage = (event: MessageEvent<LutThumbResponse>) => {
      const { id, bytes, error } = event.data
      void Effect.runFork(
        Ref.getAndUpdate(pendingRef, (pending) => {
          const rest = new Map(pending)
          rest.delete(id)
          return rest
        }).pipe(
          Effect.flatMap((pending) => {
            const entry = pending.get(id)
            if (!entry) return Effect.void
            if (bytes) return Deferred.succeed(entry.deferred, bytes)
            return Deferred.fail(entry.deferred, new Error(error ?? 'LUT thumbnail failed'))
          }),
        ),
      )
    }

    // Fail every request this worker is serving — its event loop is gone,
    // so those Deferreds would never resolve (the awaiting render fibers
    // release their inFlight slots on the failure path) — then respawn the
    // worker so the pool stays at full size. Requests on other workers are
    // untouched.
    const onError = (index: number) => (event: ErrorEvent) => {
      const message = event.message || 'Thumb worker crashed'
      void Effect.runFork(
        Ref.modify(pendingRef, (pending) => {
          const rest = new Map(pending)
          const failed: Array<Deferred.Deferred<Uint8Array, Error>> = []
          for (const [id, entry] of pending) {
            if (entry.worker === index) {
              rest.delete(id)
              failed.push(entry.deferred)
            }
          }
          return [
            Effect.forEach(failed, (deferred) => Deferred.fail(deferred, new Error(message)), {
              discard: true,
            }),
            rest,
          ]
        }).pipe(
          Effect.flatten,
          Effect.tap(() => Effect.sync(() => workers[index]!.terminate())),
          Effect.tap(() => Effect.sync(() => (workers[index] = spawn(index)))),
        ),
      )
    }

    for (let i = 0; i < poolSize; i++) workers.push(spawn(i))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const worker of workers) worker.terminate()
      }),
    )

    return LutThumbnailer.of({
      render: (lutId, bitmap, cube) =>
        Effect.gen(function* () {
          // Downscale once per photo: the slot is keyed by bitmap identity,
          // so a group's concurrent commands share one canvas-2D op. The
          // ImageData is then structured-cloned into each request — one
          // buffer serves the whole pool, so it cannot be transferred.
          const cached = yield* Ref.get(downscaleRef)
          let image: ImageData
          if (Option.isSome(cached) && cached.value.bitmap === bitmap) {
            image = cached.value.image
          } else {
            const downscaled = yield* thumbImageData(bitmap).pipe(Effect.option)
            if (Option.isNone(downscaled)) return Option.none()
            image = downscaled.value
            yield* Ref.set(downscaleRef, Option.some({ bitmap, image }))
          }

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
          const index = (yield* Ref.updateAndGet(roundRobinRef, (n) => n + 1)) % workers.length
          yield* Ref.update(pendingRef, (pending) =>
            new Map(pending).set(id, { deferred, worker: index }),
          )
          const request: LutThumbRequest = { id, image, cube }
          workers[index]!.postMessage(request)

          const result = yield* Deferred.await(deferred).pipe(Effect.option)
          // The slot is released on every completion path — success,
          // failure, or the worker crashing (the crash path already removed
          // its worker's entries; the conditional remove is then a no-op).
          // The remove is conditional so a newer batch's registration for
          // the same lutId (a different photo) is never clobbered.
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
