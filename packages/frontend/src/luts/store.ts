import { Context, Effect, Layer, Option, Ref } from 'effect'
import { GpuError, parseCube, type LutCube, type LutId } from '@lutra/engine'

// The LUT library lives in the frontend's static assets (vendored from the
// Film-Luts mirror — see packages/frontend/public/luts/README.md). This
// service owns loading it: the catalog (film_luts.json, fetched once at
// startup) and per-cube bytes (fetched on demand, parsed once per lutId,
// then memoized). The engine stays pure — it only parses text it is given.

// ---- catalog ----

/** One entry of the upstream film_luts.json, verbatim. */
export interface LutCatalogEntry {
  readonly name: string
  /** The LUT library reference — doubles as the layer's lutId. */
  readonly lut_file: LutId
  readonly category: string
  readonly thumbnail: string
}

// ---- service ----

export interface LutStoreShape {
  /** The LUT library catalog (film_luts.json). Memoized; failures are not cached. */
  readonly getCatalog: () => Effect.Effect<ReadonlyArray<LutCatalogEntry>, GpuError>
  /** Parse the `.cube` for a lutId, memoized per id. Failures are not cached. */
  readonly getCube: (lutId: LutId) => Effect.Effect<LutCube, GpuError>
}

export class LutStore extends Context.Service<LutStore, LutStoreShape>()('LutStore') {}

const fetchText = (path: string): Effect.Effect<string, GpuError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(path)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${path}`)
      }
      return await res.text()
    },
    catch: (cause) =>
      new GpuError({
        message: `Failed to load ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  })

/** Parse `.cube` text, mapping parser throws into GpuError. */
const parseCubeText = (lutId: LutId, text: string): Effect.Effect<LutCube, GpuError> =>
  Effect.try({
    try: () => parseCube(text),
    catch: (cause) =>
      new GpuError({
        message: `Failed to parse LUT ${lutId}: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  })

/** Parse the catalog JSON; the upstream shape is `{ filmLUTs: [...] }`. */
const parseCatalog = (text: string): ReadonlyArray<LutCatalogEntry> => {
  const parsed: { filmLUTs: ReadonlyArray<LutCatalogEntry> } = JSON.parse(text)
  return parsed.filmLUTs
}

/**
 * Memoization lives inside the Layer as Refs, not module globals: the cache
 * is scoped to the service instance, so a rebuilt Layer (test, HMR, a second
 * app instance) starts fresh. The Effect itself is cached so concurrent
 * callers share one fetch; a failure drops the entry so a retry re-fetches.
 */
export const LutStoreLive = Layer.effect(
  LutStore,
  Effect.gen(function* () {
    const catalogRef = yield* Ref.make<
      Option.Option<Effect.Effect<ReadonlyArray<LutCatalogEntry>, GpuError>>
    >(Option.none())
    const cubeCacheRef = yield* Ref.make(new Map<LutId, Effect.Effect<LutCube, GpuError>>())

    return LutStore.of({
      getCatalog: () =>
        Effect.gen(function* () {
          const cached = yield* Ref.get(catalogRef)
          if (Option.isSome(cached)) {
            return yield* cached.value
          }

          const effect = fetchText('/luts/film_luts.json').pipe(
            Effect.flatMap((text) =>
              Effect.try({
                try: () => parseCatalog(text),
                catch: (cause) =>
                  new GpuError({
                    message: `Failed to parse LUT catalog: ${cause instanceof Error ? cause.message : String(cause)}`,
                    cause,
                  }),
              }),
            ),
            // A failed fetch must not be memoized: drop the entry so the
            // next caller re-fetches.
            Effect.tapError(() => Ref.set(catalogRef, Option.none())),
          )
          yield* Ref.set(catalogRef, Option.some(effect))
          return yield* effect
        }),

      getCube: (lutId) =>
        Effect.gen(function* () {
          const cached = yield* Ref.get(cubeCacheRef).pipe(Effect.map((cache) => cache.get(lutId)))
          if (cached) {
            return yield* cached
          }

          const effect = fetchText(`/luts/${lutId}`).pipe(
            Effect.flatMap((text) => parseCubeText(lutId, text)),
            Effect.tapError(() =>
              Ref.update(cubeCacheRef, (cache) => {
                const next = new Map(cache)
                next.delete(lutId)
                return next
              }),
            ),
          )
          yield* Ref.update(cubeCacheRef, (cache) => {
            const next = new Map(cache)
            next.set(lutId, effect)
            return next
          })
          return yield* effect
        }),
    })
  }),
)
