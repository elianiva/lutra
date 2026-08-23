import { Context, Effect, Layer, Schema } from 'effect'

// The browser Cache Storage seam for the offline library (CONTEXT.md
// "Offline library"). The page writes it (the offline fill), the service
// worker only ever reads it and runtime-caches misses into it — the cache
// name is shared with the SW by construction (scripts/build-sw.ts injects
// the same literal into the built sw.js). Because the fill is diff-based
// against this cache, nothing here is ever purged by the SW: the library
// survives service-worker swaps (docs/adr/0015).

/** The Cache Storage name holding the offline library. Injected into the
 *  service worker at build time by scripts/build-sw.ts — keep the literal
 *  and the SW's in sync (a test asserts the SW source contains it). */
export const LUT_CACHE_NAME = 'lutra-luts'

/**
 * The offline library's storage is unavailable — the Cache API threw
 * (private browsing with storage blocked, an extension, a broken origin).
 * The fill treats this as an environment failure: it never starts, the
 * machine stays Idle, and the app keeps working online. Distinct from
 * quota: quota is transient and retryable, unavailability is not.
 */
export class LutCacheError extends Schema.TaggedError<LutCacheError>()('LutCacheError', {
  cause: Schema.optional(Schema.Unknown),
  /** 'quota' — the origin's storage is full (retryable after a persist()
   *  grant or user action). 'unavailable' — the Cache API itself threw
   *  (environment failure; the fill degrades to a no-op). */
  kind: Schema.Literals(['unavailable', 'quota']),
  message: Schema.String,
}) {}

/** Normalize a Cache Storage key to a library path. The browser stores
 *  requests by their absolute URL (a relative `cache.put('/luts/…')` is
 *  resolved against the document base), while the fill diffs against the
 *  relative `/luts/…` paths it fetches — the origin must be stripped or
 *  every run sees an empty cache and re-downloads the whole library.
 *  Exported for the normalization test (the real Cache API is not
 *  available under happy-dom). The fallback base makes the function total
 *  for both absolute and (hypothetically) relative keys. */
export const toLibraryPath = (key: string): string => {
  // Pathological keys (a protocol-relative `//…` has no host to resolve
  // against) fall back to the key itself — the function is total.
  try {
    return new URL(key, 'https://lutra.invalid').pathname
  } catch {
    return key
  }
}

export interface LutCacheContract {
  /** True when a path is already mirrored into the offline library. */
  readonly has: (path: string) => Effect.Effect<boolean, LutCacheError>
  /** Mirror a fetched response into the offline library, keyed by path. */
  readonly put: (path: string, response: Response) => Effect.Effect<void, LutCacheError>
  /** Every path currently mirrored (origin stripped — see toLibraryPath).
   *  The diff input of each offline fill run. */
  readonly keys: () => Effect.Effect<readonly string[], LutCacheError>
  /** Drop a path from the offline library (the orphan sweep removes files
   *  the current catalog no longer references). */
  readonly delete: (path: string) => Effect.Effect<void, LutCacheError>
}

export class LutCache extends Context.Service<LutCache, LutCacheContract>()('LutCache') {}

const withCache = <A>(f: (cache: Cache) => Promise<A>): Effect.Effect<A, LutCacheError> =>
  Effect.tryPromise({
    catch: (cause) =>
      new LutCacheError({
        cause,
        kind:
          cause instanceof DOMException && cause.name === 'QuotaExceededError'
            ? 'quota'
            : 'unavailable',
        message: `Offline library storage: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
    try: async () => {
      const cache = await caches.open(LUT_CACHE_NAME)
      return await f(cache)
    },
  })

export const LutCacheLive = Layer.succeed(
  LutCache,
  LutCache.of({
    has: (path) =>
      withCache(async (cache) => await cache.match(path).then((hit) => hit !== undefined)),
    put: (path, response) =>
      withCache(async (cache) => {
        await cache.put(path, response)
      }),
    // The browser stores requests by absolute URL — strip the origin so the
    // diff sees the same `/luts/…` paths the fill fetches (toLibraryPath).
    keys: () =>
      withCache(async (cache) => (await cache.keys()).map((request) => toLibraryPath(request.url))),
    delete: (path) =>
      withCache(async (cache) => {
        await cache.delete(path)
      }),
  }),
)
