import { Context, Effect, Layer, Option, Ref, Schema } from 'effect'
import { LutParseError, parseCube } from '@lutra/engine'
import type { LutCube, LutId } from '@lutra/engine'

// The LUT library lives in the frontend's static assets (vendored from the
// Film-Luts mirror — see packages/frontend/public/luts/README.md). This
// service owns loading it: the catalog (film_luts.json, fetched once at
// startup) and per-cube bytes (fetched on demand, parsed once per lutId,
// then memoized). The engine stays pure — it only parses text it is given.

/** One entry of the upstream film_luts.json, verbatim. */
export interface LutCatalogEntry {
  readonly name: string
  /** The LUT library reference — doubles as the layer's lutId. */
  readonly lut_file: LutId
  readonly category: string
  readonly thumbnail: string
}

/**
 * The LUT library could not be loaded — an HTTP failure of the catalog or a
 * `.cube` file, or a corrupt catalog JSON (CONTEXT.md "LUT load error").
 * Distinct from the engine's `LutParseError`, which passes through
 * un-wrapped: a load error means the bytes never arrived.
 */
export class LutLoadError extends Schema.TaggedErrorClass<LutLoadError>()('LutLoadError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

export interface LutStoreContract {
  /** The LUT library catalog (film_luts.json). Memoized; failures are not cached. */
  readonly getCatalog: () => Effect.Effect<readonly LutCatalogEntry[], LutLoadError>
  /** Parse the `.cube` for a lutId, memoized per id. Failures are not cached. */
  readonly getCube: (lutId: LutId) => Effect.Effect<LutCube, LutLoadError | LutParseError>
}

export class LutStore extends Context.Service<LutStore, LutStoreContract>()('LutStore') {}

const fetchText = (path: string): Effect.Effect<string, LutLoadError> =>
  Effect.tryPromise({
    catch: (cause) =>
      cause instanceof LutLoadError
        ? cause
        : new LutLoadError({
            cause,
            message: `Failed to load ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
    try: async () => {
      const res = await fetch(path)
      if (!res.ok) {
        throw new LutLoadError({ message: `Failed to load ${path}: HTTP ${res.status}` })
      }
      return await res.text()
    },
  })

/** Parse `.cube` text, passing the engine's `LutParseError` through un-wrapped. */
const parseCubeText = (lutId: LutId, text: string): Effect.Effect<LutCube, LutParseError> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof LutParseError
        ? cause
        : new LutParseError({
            message: `Failed to parse LUT ${lutId}: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
    try: () => parseCube(text),
  })

/** Parse the catalog JSON; the upstream shape is `{ filmLUTs: [...] }`. */
const parseCatalog = (text: string): Effect.Effect<readonly LutCatalogEntry[], LutLoadError> =>
  Effect.try({
    catch: (cause) =>
      new LutLoadError({
        cause,
        message: `Failed to parse LUT catalog: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
    try: () => {
      const parsed: { filmLUTs: readonly LutCatalogEntry[] } = JSON.parse(text)
      return parsed.filmLUTs
    },
  })

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
      Option.Option<Effect.Effect<readonly LutCatalogEntry[], LutLoadError>>
    >(Option.none())
    const cubeCacheRef = yield* Ref.make(
      new Map<LutId, Effect.Effect<LutCube, LutLoadError | LutParseError>>(),
    )

    return LutStore.of({
      getCatalog: () => Effect.gen(function* () {
        const cached = yield* Ref.get(catalogRef)
          if (Option.isSome(cached)) {
            return yield* cached.value
          }

          const effect = fetchText('/luts/film_luts.json').pipe(
            Effect.flatMap((text) => parseCatalog(text)),
            // A failed fetch must not be memoized: drop the entry so the
            // next caller re-fetches.
            Effect.tapError(() => Ref.set(catalogRef, Option.none())),
          )
          yield* Ref.set(catalogRef, Option.some(effect))
        return yield* effect
      }),

      getCube: (lutId) => Effect.gen(function* () {
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
