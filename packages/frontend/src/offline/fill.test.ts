import { describe, it as vitestIt, expect, vi, afterEach } from 'vitest'
import { it } from '@effect/vitest'
import { Arbitrary, Duration, Effect, Schema } from 'effect'
import { fillFiles, libraryFiles } from './fill'
import type { FillOptions } from './fill'
import type { FillEvent } from './messages'
import type { LutCacheContract } from './cache'
import { LutCacheError } from './cache'
import type { LutCatalogEntry } from '../luts/store'
import { LutId } from '@lutra/engine'

// The fill loop, driven with fakes: an in-memory cache, a stubbed fetch, and
// a controllable navigator.onLine. The loop is pure Effect — these tests
// collect its events through the emit channel and assert the sequence.

const lutA = LutId('luts/print/a.cube')
const lutB = LutId('luts/bw/b.cube')

const catalog: readonly LutCatalogEntry[] = [
  { category: 'Print', lut_file: lutA, name: 'A', thumbnail: 'thumbnails/print/a.jpg' },
  { category: 'Bw', lut_file: lutB, name: 'B', thumbnail: 'thumbnails/bw/b.jpg' },
]

// The library is the catalog plus one cube and one thumb per entry.
const TOTAL = 1 + 2 * catalog.length

const fakeCache = (initial: readonly string[] = []): LutCacheContract => {
  const store = new Map<string, Response>()
  for (const path of initial) {
    store.set(path, new Response('cached'))
  }
  return {
    delete: (path: string) =>
      Effect.sync(() => {
        store.delete(path)
      }),
    has: (path: string) => Effect.succeed(store.has(path)),
    keys: () => Effect.succeed([...store.keys()]),
    put: (path: string, response: Response) =>
      Effect.sync(() => {
        store.set(path, response)
      }),
  }
}

const okFetch = vi.fn(async () => new Response('bytes', { status: 200 }))

/** A controllable navigator.onLine for the offline-pause tests. */
const online = (value: boolean) => {
  let current = value
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => current,
  })
  return {
    set: (next: boolean) => {
      current = next
    },
  }
}

const opts = (overrides: Partial<FillOptions> = {}): FillOptions => {
  const cache: LutCacheContract = fakeCache()
  return {
    backoff: () => Duration.millis(1),
    batchDelay: Duration.millis(1),
    batchSize: 2,
    cache,
    fetchImpl: okFetch,
    maxAttempts: 3,
    pollInterval: Duration.millis(5),
    ...overrides,
  }
}

/** Run one fill and collect its events through the emit channel. Defaults to
 *  the module catalog; property tests pass a random one. */
const collectEvents = async (
  options: FillOptions,
  catalogEntries: readonly LutCatalogEntry[] = catalog,
): Promise<readonly FillEvent[]> => {
  const events: FillEvent[] = []
  return await Effect.runPromise(
    fillFiles(catalogEntries, options, (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
    ).pipe(Effect.as(events)),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  okFetch.mockClear()
  // Restore the real onLine (a leaked test getter would strand later tests
  // in waitIfOffline).
  interface OnLineHost {
    onLine?: boolean
  }
  // SAFETY: leaks a test-controlled onLine getter; the loop branches on it before deciding to wait.
  // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
  const nav = navigator as OnLineHost
  delete nav.onLine
})

describe('fillFiles', () => {
  vitestIt('mirrors every missing file in order, announcing progress per file', async () => {
    const events = await collectEvents(opts())
    expect(events[0]).toEqual({ _tag: 'FillStarted', done: 0, total: TOTAL })
    expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
    const files = events.filter(
      (e) => e._tag === 'FillFileStarted' || e._tag === 'FillFileCompleted',
    )
    expect(files).toHaveLength(TOTAL * 2)
    // Every started file completes; the sequence is strictly
    // started→completed per file (the events alternate per file).
    for (let i = 0; i < TOTAL; i++) {
      expect(files[i * 2]).toMatchObject({ _tag: 'FillFileStarted' })
      expect(files[i * 2 + 1]).toMatchObject({ _tag: 'FillFileCompleted' })
    }
    expect(okFetch).toHaveBeenCalledTimes(TOTAL)
  })

  vitestIt('the diff skips already-cached files and reports them as done', async () => {
    const cache = fakeCache([`/luts/${lutA}`, '/luts/thumbnails/print/a.jpg'])
    const events = await collectEvents(opts({ cache }))
    expect(events[0]).toEqual({ _tag: 'FillStarted', done: 2, total: TOTAL })
    const completed = events.filter((e) => e._tag === 'FillFileCompleted')
    expect(completed).toHaveLength(TOTAL - 2)
    const paths = completed.map((e) => (e._tag === 'FillFileCompleted' ? e.file.path : ''))
    expect(paths).not.toContain(`/luts/${lutA}`)
  })

  vitestIt('a fully cached library emits nothing (a silent boot, no toast)', async () => {
    const cache = fakeCache([
      '/luts/film_luts.json',
      `/luts/${lutA}`,
      '/luts/thumbnails/print/a.jpg',
      `/luts/${lutB}`,
      '/luts/thumbnails/bw/b.jpg',
    ])
    const events = await collectEvents(opts({ cache }))
    expect(events).toEqual([])
  })

  vitestIt(
    'a run sweeps orphans a catalog shrink left behind (a deploy removed a LUT)',
    async () => {
      const cache = fakeCache(['/luts/print/removed.cube', '/luts/README.md'])
      const events = await collectEvents(opts({ cache }))
      // The run still completes normally…
      expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
      // …but the unreferenced files are gone and every library file is cached.
      const remaining = await Effect.runPromise(cache.keys())
      expect(remaining).toEqual([
        '/luts/film_luts.json',
        `/luts/${lutA}`,
        '/luts/thumbnails/print/a.jpg',
        `/luts/${lutB}`,
        '/luts/thumbnails/bw/b.jpg',
      ])
    },
  )

  vitestIt('a silent boot also sweeps orphans (full library + a stale key)', async () => {
    const cache = fakeCache([
      '/luts/film_luts.json',
      `/luts/${lutA}`,
      '/luts/thumbnails/print/a.jpg',
      `/luts/${lutB}`,
      '/luts/thumbnails/bw/b.jpg',
      '/luts/print/removed.cube',
    ])
    const events = await collectEvents(opts({ cache }))
    // No events (the boot stays silent)…
    expect(events).toEqual([])
    // …but the sweep still ran.
    const remaining = await Effect.runPromise(cache.keys())
    expect(remaining).not.toContain('/luts/print/removed.cube')
    expect(remaining).toHaveLength(TOTAL)
  })

  vitestIt('cube files carry their lutId; catalog and thumbnails carry null', () => {
    const files = libraryFiles(catalog)
    expect(files).toHaveLength(TOTAL)
    expect(files[0]).toEqual({ lutId: null, path: '/luts/film_luts.json' })
    const cubes = files.filter((f) => f.lutId !== null)
    expect(cubes.map((c) => c.path)).toEqual([`/luts/${lutA}`, `/luts/${lutB}`])
  })

  vitestIt('waits while offline and announces Paused/Resumed around the wait', async () => {
    const connectivity = online(false)
    // The connection returns shortly after the loop starts waiting — a
    // timer, not the fetch, because the fetch only runs once the loop has
    // seen the connection again.
    const timer = setTimeout(() => {
      connectivity.set(true)
    }, 60)
    const events = await collectEvents(opts())
    clearTimeout(timer)
    const tags = events.map((e) => e._tag)
    expect(tags).toContain('FillPaused')
    expect(tags).toContain('FillResumed')
    // The run still completed.
    expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
  })

  vitestIt(
    'retries transient failures with backoff, then reports the file failed and continues',
    async () => {
      // The first cube's path fails twice, then succeeds — the retry happens
      // per file, so the other files must never see the failure mock.
      let attemptsForA = 0
      const flaky = vi.fn(async (path: string) => {
        if (path === `/luts/${lutA}`) {
          attemptsForA++
          if (attemptsForA < 3) {
            throw new TypeError('network down')
          }
        }
        return new Response('bytes', { status: 200 })
      })
      const events = await collectEvents(opts({ fetchImpl: flaky, maxAttempts: 3 }))
      expect(attemptsForA).toBe(3)
      expect(events.filter((e) => e._tag === 'FillFileFailed')).toHaveLength(0)
      expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
    },
  )

  vitestIt(
    'a persistently failing file is skipped (failed event) but the run completes',
    async () => {
      const dead = vi.fn(async (path: string) =>
        path === `/luts/${lutA}`
          ? await Promise.reject(new TypeError('network down'))
          : await Promise.resolve(new Response('bytes', { status: 200 })),
      )
      const events = await collectEvents(opts({ fetchImpl: dead, maxAttempts: 2 }))
      expect(events.filter((e) => e._tag === 'FillFileFailed')).toHaveLength(1)
      expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
    },
  )

  vitestIt('a quota failure stops the run with FillQuotaError — no completion', async () => {
    const quotaCache = {
      ...fakeCache(),
      put: () => Effect.fail(new LutCacheError({ kind: 'quota', message: 'origin storage full' })),
    }
    const events = await collectEvents(opts({ cache: quotaCache, maxAttempts: 3 }))
    expect(events.at(-1)).toMatchObject({
      _tag: 'FillQuotaError',
      message: 'origin storage full',
    })
    expect(events.some((e) => e._tag === 'FillComplete')).toBe(false)
  })

  vitestIt('an unavailable cache gate keeps the fill silent (no events at all)', async () => {
    const brokenCache = {
      ...fakeCache(),
      keys: () => Effect.fail(new LutCacheError({ kind: 'unavailable', message: 'nope' })),
    }
    const events = await collectEvents(opts({ cache: brokenCache }))
    expect(events).toEqual([])
  })

  vitestIt('pauses between batches (the throttle)', async () => {
    const slow = opts({
      batchDelay: Duration.millis(5),
      batchSize: 1,
      cache: fakeCache(),
      fetchImpl: okFetch,
    })
    const started = Date.now()
    await collectEvents(slow)
    // 5 batches × 5ms minimum — the loop actually slept between batches.
    expect(Date.now() - started).toBeGreaterThanOrEqual(20)
    expect(okFetch).toHaveBeenCalledTimes(TOTAL)
  })
})

// Property tests derive their inputs from Effect Schemas and generate through
// Effect's `Arbitrary` (docs/adr/0012-property-testing).

/** Characters a generated path segment is built from, drawn explicitly so
 *  the generator never spends runs rejecting what a pattern would filter. */
const PATH_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789._-'

const segmentArb = Arbitrary.map(
  Arbitrary.array(Arbitrary.schema(Schema.Literals(PATH_CHARS.split(''))), {
    maxLength: 20,
    minLength: 1,
  }),
  (chars) => chars.join(''),
)

/** Unique paths under a directory, so the catalog never repeats a file. */
const uniquePathsArb = (directory: string): Arbitrary.Arbitrary<readonly string[]> =>
  Arbitrary.map(Arbitrary.array(segmentArb, { maxLength: 6, minLength: 0 }), (segments) =>
    [...new Set(segments)].map((segment) => `${directory}/${segment}`),
  )

/** A boolean per element: the mask that selects a subset deterministically. */
const maskArb = (length: number): Arbitrary.Arbitrary<readonly boolean[]> =>
  Arbitrary.array(Arbitrary.schema(Schema.Boolean), { maxLength: length, minLength: length })

/** A random fill scenario: a catalog, an arbitrary cache snapshot (library
 *  files already mirrored, plus orphans a shrink left behind), and a
 *  per-file fetch verdict. The catalog pairs unique LUT references with
 *  unique thumbnails, so the library file list never contains duplicates. */
const scenarioArb = Arbitrary.flatMap(
  Arbitrary.all({
    lutFiles: uniquePathsArb('luts'),
    thumbnails: uniquePathsArb('thumbnails'),
    meta: Arbitrary.array(
      Arbitrary.all({
        category: segmentArb,
        name: segmentArb,
      }),
      { maxLength: 6, minLength: 6 },
    ),
  }),
  ({ lutFiles, thumbnails, meta }) => {
    const entries: LutCatalogEntry[] = meta
      .slice(0, Math.min(lutFiles.length, thumbnails.length))
      .map((entry, i) => ({ ...entry, lut_file: LutId(lutFiles[i]!), thumbnail: thumbnails[i]! }))
    const files = libraryFiles(entries)
    return Arbitrary.map(
      Arbitrary.all({
        cachedMask: maskArb(files.length),
        // A verdict per library file; only the missing ones are ever fetched.
        failures: maskArb(files.length),
        orphans: Arbitrary.map(
          Arbitrary.array(segmentArb, { maxLength: 3, minLength: 0 }),
          (segments) => segments.map((segment) => `/luts/${segment}`),
        ),
      }),
      ({ cachedMask, failures, orphans }) => ({
        entries,
        files,
        cached: files.filter((_, i) => cachedMask[i] === true).map((file) => file.path),
        failures,
        orphans,
      }),
    )
  },
)

describe('fillFiles (property-based)', () => {
  it.effect.prop(
    'any catalog and cache converge to exactly the library files',
    { scenario: scenarioArb },
    ({ scenario: { entries, files, cached, orphans } }) =>
      Effect.gen(function* () {
        const cache = fakeCache([...cached, ...orphans])
        const fetchImpl = vi.fn(async () => new Response('bytes', { status: 200 }))
        const events = yield* Effect.promise(() =>
          collectEvents(opts({ cache, fetchImpl }), entries),
        )

        // Every library file is mirrored; orphans are swept; nothing else
        // remains.
        const remaining = yield* cache.keys()
        expect([...remaining].sort()).toEqual(files.map((f) => f.path).sort())

        // Only the missing files are fetched, exactly once each, in order.
        const missing = files.filter((f) => !cached.includes(f.path))
        if (missing.length === 0) {
          // A fully cached library boots silently: no events at all.
          expect(events).toEqual([])
          return true
        }
        expect(fetchImpl).toHaveBeenCalledTimes(missing.length)
        for (const f of missing) {
          expect(fetchImpl).toHaveBeenCalledWith(f.path)
        }

        // The event stream mirrors the diff: a Started header, per-file
        // started→completed pairs in library order, a Complete footer.
        expect(events[0]).toEqual({
          _tag: 'FillStarted',
          done: files.length - missing.length,
          total: files.length,
        })
        expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
        const fileEvents = events.filter(
          (e) => e._tag === 'FillFileStarted' || e._tag === 'FillFileCompleted',
        )
        expect(fileEvents).toHaveLength(missing.length * 2)
        for (let i = 0; i < missing.length; i++) {
          expect(fileEvents[i * 2]).toMatchObject({ _tag: 'FillFileStarted' })
          expect(fileEvents[i * 2 + 1]).toEqual({
            _tag: 'FillFileCompleted',
            file: missing[i],
          })
        }
        expect(events.some((e) => e._tag === 'FillFileFailed')).toBe(false)
        expect(events.some((e) => e._tag === 'FillQuotaError')).toBe(false)
        return true
      }),
    { arbitrary: { runs: 25 } },
  )

  it.effect.prop(
    'per-file failures are reported, never cached, and the run still completes',
    { scenario: scenarioArb },
    ({ scenario: { entries, files, cached, orphans, failures } }) =>
      Effect.gen(function* () {
        const failSet = new Set(files.filter((_, i) => failures[i] === true).map((f) => f.path))
        const missing = files.filter((f) => !cached.includes(f.path))
        const failed = missing.filter((f) => failSet.has(f.path))
        const succeeded = missing.filter((f) => !failSet.has(f.path))

        if (missing.length === 0) {
          // Fully cached: silent boot, nothing fetched.
          const silentCache = fakeCache([...cached, ...orphans])
          const silentFetch = vi.fn(async () => new Response('bytes', { status: 200 }))
          const silentEvents = yield* Effect.promise(() =>
            collectEvents(opts({ cache: silentCache, fetchImpl: silentFetch }), entries),
          )
          expect(silentEvents).toEqual([])
          expect(silentFetch).not.toHaveBeenCalled()
          return true
        }

        const cache = fakeCache([...cached, ...orphans])
        const fetchImpl = vi.fn(async (path: string) =>
          failSet.has(path)
            ? await Promise.reject(new TypeError('network down'))
            : await Promise.resolve(new Response('bytes', { status: 200 })),
        )
        // One attempt per file: every fetch happens exactly once and the
        // verdict is final.
        const events = yield* Effect.promise(() =>
          collectEvents(opts({ cache, fetchImpl, maxAttempts: 1 }), entries),
        )

        // The cache holds the library minus the failed files (orphans are
        // swept regardless).
        const remaining = yield* cache.keys()
        expect([...remaining].sort()).toEqual([...cached, ...succeeded.map((f) => f.path)].sort())

        // Every missing file was attempted exactly once.
        expect(fetchImpl).toHaveBeenCalledTimes(missing.length)
        for (const f of missing) {
          expect(fetchImpl).toHaveBeenCalledWith(f.path)
        }

        // Failed files announce FillFileFailed, successful ones complete,
        // and the run still finishes with FillComplete.
        const completed = events.filter((e) => e._tag === 'FillFileCompleted')
        expect(completed.map((e) => (e._tag === 'FillFileCompleted' ? e.file.path : ''))).toEqual(
          succeeded.map((f) => f.path),
        )
        const reported = events.filter((e) => e._tag === 'FillFileFailed')
        expect(reported.map((e) => (e._tag === 'FillFileFailed' ? e.file.path : ''))).toEqual(
          failed.map((f) => f.path),
        )
        expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
        expect(events.some((e) => e._tag === 'FillQuotaError')).toBe(false)
        return true
      }),
    { arbitrary: { runs: 15 } },
  )
})
