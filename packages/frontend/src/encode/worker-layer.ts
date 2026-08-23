import { Deferred, Effect, Layer, Ref } from 'effect'
import { EncodeError, ImageEncoder } from '@lutra/engine'
import type { EncodeRequest, EncodeResponse } from './worker'

/**
 * Worker-backed `ImageEncoder`: the app's live implementation. Encoding runs
 * off the main thread (a 12MP AVIF encode takes seconds); the worker is
 * created once and terminated with the layer. The worker itself imports the
 * engine's pure encode — the codec knowledge stays in the engine (see
 * docs/adr/0004-export).
 */
export const ImageEncoderWorkerLive = Layer.effect(
  ImageEncoder,
  Effect.gen(function* () {
    const worker = new Worker(new URL('worker.ts', import.meta.url), { type: 'module' })
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        worker.terminate()
      }),
    )

    const pendingRef = yield* Ref.make<
      ReadonlyMap<number, Deferred.Deferred<Uint8Array, EncodeError>>
    >(new Map())
    const nextIdRef = yield* Ref.make(0)

    const failAll = (message: string): Effect.Effect<void> =>
      Ref.getAndSet(pendingRef, new Map()).pipe(
        Effect.flatMap((pending) =>
          Effect.forEach(
            pending,
            ([, deferred]) => Deferred.fail(deferred, new EncodeError({ message })),
            { discard: true },
          ),
        ),
      )

    // Worker events fire outside the Effect runtime's stack — route through
    // the default runtime's background fork, like the backend's
    // uncapturederror handler.
    worker.onmessage = (event: MessageEvent<EncodeResponse>) => {
      const { id, bytes, error } = event.data
      void Effect.runFork(
        Ref.getAndUpdate(pendingRef, (pending) => {
          const rest = new Map(pending)
          rest.delete(id)
          return rest
        }).pipe(
          Effect.flatMap((pending) => {
            const deferred = pending.get(id)
            if (!deferred) {
              return Effect.void
            }
            if (bytes) {
              return Deferred.succeed(deferred, bytes)
            }
            return Deferred.fail(deferred, new EncodeError({ message: error ?? 'Encode failed' }))
          }),
        ),
      )
    }
    worker.onerror = (event) => {
      void Effect.runFork(failAll(event.message || 'Encode worker crashed'))
    }

    return ImageEncoder.of({
      encode: ({ image, settings }) =>
        Effect.gen(function* () {
          const id = yield* Ref.getAndUpdate(nextIdRef, (n) => n + 1)
          const deferred = yield* Deferred.make<Uint8Array, EncodeError>()
          yield* Ref.update(pendingRef, (pending) => new Map(pending).set(id, deferred))
          const request: EncodeRequest = { id, image, settings }
          worker.postMessage(request)
          return yield* Deferred.await(deferred)
        }),
    })
  }),
)
