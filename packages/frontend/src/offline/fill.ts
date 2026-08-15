import { Context, Duration, Effect, Layer, PubSub, Ref, Schedule, Stream } from 'effect'
import { LutStore, LutStoreLive, type LutCatalogEntry } from '../luts/store'
import { LutCache, LutCacheLive, type LutCacheShape } from './cache'
import type { FillEvent, FillFile } from './messages'
import type { LutId } from '@lutra/engine'

// The offline fill (CONTEXT.md "Offline fill"): the background process that
// mirrors the vendored LUT library into Cache Storage so the app works
// without a connection. Page-driven by design (docs/adr/0015): the fill
// runs as a fiber in a service layer, publishing per-file events into a
// PubSub; a root subscription bridges those events into the message loop
// (per-LUT rows, the progress card, the "Offline ready" toast all read the
// same channel). The service worker never drives this — it only serves the
// cache the fill writes.

// ---- the file list the library is made of ----

/** Every file of the offline library: the catalog itself, then per entry
 *  the `.cube` and the generic thumbnail. The path is the URL the app
 *  already fetches (the LUT bar reads `/luts/${entry.thumbnail}`, the cube
 *  loader `/luts/${entry.lut_file}`), so a mirrored file is byte-identical
 *  to what the app requests — the SW's cache-first read is a straight hit.
 */
export const libraryFiles = (catalog: ReadonlyArray<LutCatalogEntry>): ReadonlyArray<FillFile> => [
  { path: '/luts/film_luts.json', lutId: null },
  ...catalog.flatMap((entry) => [
    // oxlint-disable-next-line consistent-type-assertions
    { path: `/luts/${entry.lut_file}`, lutId: entry.lut_file as LutId },
    { path: `/luts/${entry.thumbnail}`, lutId: null },
  ]),
]

// ---- the loop ----

export interface FillOptions {
  readonly cache: LutCacheShape
  /** Network fetch; injectable so tests stub it. Defaults to `fetch`. */
  readonly fetchImpl: (path: string) => Promise<Response>
  /** Files fetched before the loop rests (the throttle that keeps the fill
   *  from competing with real browsing). */
  readonly batchSize: number
  readonly batchDelay: Duration.Duration
  /** How often the loop re-checks the connection while waiting offline. */
  readonly pollInterval: Duration.Duration
  /** Transient-failure attempts per file (with `backoff` between). */
  readonly maxAttempts: number
  readonly backoff: (attempt: number) => Duration.Duration
}

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine

/** Blocks while the device is offline, polling `pollInterval`. Returns true
 *  when it actually had to wait (the caller announces Paused/Resumed). */
const waitIfOffline = (opts: FillOptions): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    let online = yield* Effect.sync(isOnline)
    if (online) return false
    while (!online) {
      yield* Effect.sleep(opts.pollInterval)
      online = yield* Effect.sync(isOnline)
    }
    return true
  })

/** One file: fetch (transient failures retried with backoff, waiting out
 *  offline periods) then mirror into the cache. Succeeds with true when the
 *  file is cached, false when the transient failures were exhausted; fails
 *  with a quota stop (terminal — the whole run stops). */
const fetchAndPut = (file: FillFile, opts: FillOptions): Effect.Effect<boolean, string> => {
  type Failure =
    | { readonly _tag: 'transient'; readonly cause: unknown }
    | { readonly _tag: 'quota'; readonly message: string }

  const attempt = (n: number): Effect.Effect<boolean, string> =>
    Effect.gen(function* () {
      yield* waitIfOffline(opts)
      const outcome = yield* Effect.gen(function* () {
        const res = yield* Effect.tryPromise({
          try: () => opts.fetchImpl(file.path),
          catch: (cause) => ({ _tag: 'transient' as const, cause }),        })
        if (!res.ok) {
          return yield* Effect.fail({ _tag: 'transient' as const, cause: new Error(`HTTP ${res.status}`) })
        }
        yield* opts.cache.put(file.path, res).pipe(
          Effect.mapError(
            (error): Failure =>
              error.kind === 'quota'
                ? { _tag: 'quota', message: error.message }
                : // Storage unavailable mid-run (has/keys worked at the start
                  // gate, so this is exotic): retry like a transient failure.
                  { _tag: 'transient', cause: error },
          ),
        )
        return true
      }).pipe(Effect.result)
      if (outcome._tag === 'Success') return true
      if (outcome.failure._tag === 'quota') return yield* Effect.fail(outcome.failure.message)
      if (n >= opts.maxAttempts) return false
      yield* Effect.sleep(opts.backoff(n))
      return yield* attempt(n + 1)
    })
  return attempt(1)
}

/** Drop every cached file the current library no longer references (a
 *  deploy removed a LUT from the catalog): the offline cache would otherwise
 *  grow forever. Housekeeping — a failure is ignored, the next run retries.
 *  Emits nothing: a run's event stream is untouched. */
const pruneOrphans = (files: ReadonlyArray<FillFile>, opts: FillOptions): Effect.Effect<void, never> => {
  const allowed = new Set(files.map((file) => file.path))
  return opts.cache
    .keys()
    .pipe(
      Effect.flatMap((keys) =>
        Effect.forEach(
          keys.filter((key) => !allowed.has(key)),
          (key) => opts.cache.delete(key),
          { discard: true },
        ),
      ),
      Effect.option,
      Effect.asVoid,
    )
}

/**
 * The fill run: diff the catalog against the cache, then mirror every
 * missing file, emitting one event per file into `emit` (the service wires
 * `emit` to its PubSub; tests collect the events). Pure and testable — no
 * globals beyond `navigator.onLine` (polled while offline).
 *
 * A run that finds nothing missing emits nothing and returns: a completed
 * library boots silently (no events, no toast — Ready is a per-session
 * transition, and a full cache never transitions).
 */
export const fillFiles = (
  catalog: ReadonlyArray<LutCatalogEntry>,
  opts: FillOptions,
  emit: (event: FillEvent) => Effect.Effect<void>,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const files = libraryFiles(catalog)
    // The start gate: an unavailable cache (the Cache API threw) means the
    // offline library cannot work at all — the fill stays silent and the
    // machine never leaves Idle. The app keeps working online. (An empty
    // cache is a Success with no keys — that is the normal first run.)
    const cached = yield* opts.cache.keys().pipe(
      Effect.result,
      Effect.map((result) => (result._tag === 'Success' ? result.success : null)),
    )
    if (cached === null) return
    const cachedSet = new Set(cached)
    const missing = files.filter((file) => !cachedSet.has(file.path))
    if (missing.length > 0) {
      yield* emit({ _tag: 'FillStarted', total: files.length, done: files.length - missing.length })
      for (let i = 0; i < missing.length; i++) {
        const file = missing[i]!
        const wasOffline = yield* waitIfOffline(opts)
        if (wasOffline) {
          yield* emit({ _tag: 'FillPaused' })
          yield* emit({ _tag: 'FillResumed' })
        }
        yield* emit({ _tag: 'FillFileStarted', file })
        const outcome = yield* fetchAndPut(file, opts).pipe(Effect.result)
        if (outcome._tag === 'Failure') {
          // Quota — terminal: announce and stop the run (the machine shows
          // QuotaError; the app retries once with a fresh persist() grant).
          yield* emit({ _tag: 'FillQuotaError', message: outcome.failure })
          return
        }
        yield* emit(
          outcome.success
            ? { _tag: 'FillFileCompleted', file }
            : { _tag: 'FillFileFailed', file },
        )
        if ((i + 1) % opts.batchSize === 0) yield* Effect.sleep(opts.batchDelay)
      }
      yield* emit({ _tag: 'FillComplete' })
    }
    // Every run — full or silent — sweeps orphans left by earlier runs or
    // catalog shrinks (a deploy removed a LUT).
    yield* pruneOrphans(files, opts)
  })

// ---- service ----

export interface OfflineFillShape {
  /** Per-file fill events; the root subscription bridges this into the
   *  message loop. Unbounded, so events published before the subscription
   *  attaches (boot order) are buffered, not lost. */
  readonly events: PubSub.PubSub<FillEvent>
  /** Start a fill run. Idempotent per session; a run that ends in a quota
   *  error (or a hard failure) re-arms so a later call starts a fresh run. */
  readonly start: () => Effect.Effect<void>
}

export class OfflineFill extends Context.Service<OfflineFill, OfflineFillShape>()('OfflineFill') {}

export const OfflineFillLive = Layer.effect(
  OfflineFill,
  Effect.gen(function* () {
    const events = yield* PubSub.unbounded<FillEvent>()
    // Start signals: `start()` publishes; a supervisor fiber owned by the
    // layer's scope (killed with the app) runs one fill loop per signal.
    const startSignal = yield* PubSub.unbounded<void>()
    const startedRef = yield* Ref.make(false)
    const cache = yield* LutCache
    const store = yield* LutStore

    const opts: FillOptions = {
      cache,
      fetchImpl: (path) => fetch(path),
      batchSize: 6,
      batchDelay: Duration.millis(400),
      pollInterval: Duration.millis(300),
      maxAttempts: 3,
      backoff: (n) => Duration.millis(300 * n),
    }

    const publish = (event: FillEvent): Effect.Effect<void> =>
      Effect.gen(function* () {
        // A quota stop re-arms the fill so the persist-retry can start a
        // fresh run (the machine's QuotaError → OfflineFillStarted edge).
        if (event._tag === 'FillQuotaError') {
          yield* Ref.set(startedRef, false)
        }
        yield* PubSub.publish(events, event)
      })

    const run = Effect.gen(function* () {
      // The catalog must land before the diff. Served by the SW from the
      // first visit on; a first-visit failure is a network-less session,
      // where a fill is pointless anyway. After the retries the run gives
      // up and re-arms (a later manual start can retry).
      const catalog = yield* store.getCatalog().pipe(
        Effect.retry({ times: 5, schedule: Schedule.exponential(Duration.millis(500), 2) }),
      )
      yield* fillFiles(catalog, opts, publish)
    })

    // The supervisor: one fill loop per start signal, forever. The fiber is
    // scoped to the layer — it lives for the app's lifetime and dies with
    // it, never with the command that triggered a start.
    yield* Effect.forkScoped(
      Stream.fromPubSub(startSignal).pipe(
        Stream.runForEach(() => run.pipe(Effect.option, Effect.asVoid)),
      ),
    )

    return OfflineFill.of({
      events,
      start: () =>
        Effect.gen(function* () {
          if (yield* Ref.get(startedRef)) return
          yield* Ref.set(startedRef, true)
          yield* PubSub.publish(startSignal, void 0)
        }),
    })
  }),
).pipe(
  // Self-contained (Layer.merge does not subtract requirements at the type
  // level in this effect version): the fill brings its own LutCache and
  // LutStore instances. The cache wraps the same browser Cache Storage the
  // SW reads — instance identity is irrelevant there; the extra catalog
  // fetch is served cache-first by the SW after the first.
  Layer.provide(Layer.merge(LutCacheLive, LutStoreLive)),
)
