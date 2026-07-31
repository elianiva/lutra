import { Context, Effect, Layer } from 'effect'
import { GpuError, parseCube, type LutCube } from '@lutra/engine'

// The LUT library lives in the frontend's static assets (vendored from the
// Film-Luts mirror — see packages/frontend/public/luts/README.md). This
// service owns loading it: the catalog (film_luts.json, fetched once at
// startup) and per-cube bytes (fetched on demand, parsed once per lutId,
// then memoized). The engine stays pure — it only parses text it is given.

// ---- catalog ----

/** One entry of the upstream film_luts.json, verbatim. */
export interface LutCatalogEntry {
  readonly name: string
  readonly lut_file: string
  readonly category: string
  readonly thumbnail: string
}

// ---- service ----

export interface LutStoreShape {
  /** The LUT library catalog (film_luts.json). Memoized; failures are not cached. */
  readonly getCatalog: () => Effect.Effect<ReadonlyArray<LutCatalogEntry>, GpuError>
  /** Parse the `.cube` for a lutId, memoized per id. Failures are not cached. */
  readonly getCube: (lutId: string) => Effect.Effect<LutCube, GpuError>
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
const parseCubeText = (lutId: string, text: string): Effect.Effect<LutCube, GpuError> =>
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

// Memoization: cache the Effect itself so concurrent callers share one
// fetch; drop the cache entry on failure so a retry re-fetches.
let catalogEffect: Effect.Effect<ReadonlyArray<LutCatalogEntry>, GpuError> | null = null
const cubeCache = new Map<string, Effect.Effect<LutCube, GpuError>>()

export const LutStoreLive = Layer.succeed(LutStore, {
  getCatalog: () => {
    let effect = catalogEffect
    if (!effect) {
      effect = fetchText('/luts/film_luts.json').pipe(
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
        Effect.catch((err) => {
          catalogEffect = null
          return Effect.fail(err)
        }),
      )
      catalogEffect = effect
    }
    return effect
  },

  getCube: (lutId) => {
    const cached = cubeCache.get(lutId)
    if (cached) return cached
    const effect = fetchText(`/luts/${lutId}`).pipe(
      Effect.flatMap((text) => parseCubeText(lutId, text)),
      Effect.catch((err) => {
        cubeCache.delete(lutId)
        return Effect.fail(err)
      }),
    )
    cubeCache.set(lutId, effect)
    return effect
  },
})
