import { describe, it, expect, vi, afterEach } from 'vitest'
import { Duration, Effect } from 'effect'
import { fillFiles, libraryFiles, type FillOptions } from './fill'
import type { FillEvent } from './messages'
import type { LutCacheShape } from './cache'
import { LutCacheError } from './cache'
import type { LutCatalogEntry } from '../luts/store'
import { LutId } from '@lutra/engine'

// The fill loop, driven with fakes: an in-memory cache, a stubbed fetch, and
// a controllable navigator.onLine. The loop is pure Effect — these tests
// collect its events through the emit channel and assert the sequence.

const lutA = LutId('luts/print/a.cube')
const lutB = LutId('luts/bw/b.cube')

const catalog: ReadonlyArray<LutCatalogEntry> = [
  { name: 'A', lut_file: lutA, category: 'Print', thumbnail: 'thumbnails/print/a.jpg' },
  { name: 'B', lut_file: lutB, category: 'Bw', thumbnail: 'thumbnails/bw/b.jpg' },
]

// The library is the catalog plus one cube and one thumb per entry.
const TOTAL = 1 + 2 * catalog.length

const fakeCache = (initial: ReadonlyArray<string> = []): LutCacheShape => {
  const store = new Map<string, Response>()
  for (const path of initial) store.set(path, new Response('cached'))
  return {
    has: (path: string) => Effect.succeed(store.has(path)),
    put: (path: string, response: Response) =>
      Effect.sync(() => {
        store.set(path, response)
      }),
    keys: () => Effect.succeed([...store.keys()]),
    delete: (path: string) =>
      Effect.sync(() => {
        store.delete(path)
      }),
  }
}

const okFetch = vi.fn(() => Promise.resolve(new Response('bytes', { status: 200 })))

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
  const cache: LutCacheShape = fakeCache()
  return {
    cache,
    fetchImpl: okFetch,
    batchSize: 2,
    batchDelay: Duration.millis(1),
    pollInterval: Duration.millis(5),
    maxAttempts: 3,
    backoff: () => Duration.millis(1),
    ...overrides,
  }
}

/** Run one fill and collect its events through the emit channel. */
const collectEvents = (options: FillOptions): Promise<ReadonlyArray<FillEvent>> => {
  const events: Array<FillEvent> = []
  return Effect.runPromise(
    fillFiles(catalog, options, (event) =>
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
  type OnLineHost = { onLine?: boolean }
  // oxlint-disable-next-line consistent-type-assertions
  const nav = navigator as OnLineHost
  delete nav.onLine
})

describe('fillFiles', () => {
  it('mirrors every missing file in order, announcing progress per file', async () => {
    const events = await collectEvents(opts())
    expect(events[0]).toEqual({ _tag: 'FillStarted', total: TOTAL, done: 0 })
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

  it('the diff skips already-cached files and reports them as done', async () => {
    const cache = fakeCache([`/luts/${lutA}`, '/luts/thumbnails/print/a.jpg'])
    const events = await collectEvents(opts({ cache }))
    expect(events[0]).toEqual({ _tag: 'FillStarted', total: TOTAL, done: 2 })
    const completed = events.filter((e) => e._tag === 'FillFileCompleted')
    expect(completed).toHaveLength(TOTAL - 2)
    const paths = completed.map((e) => (e._tag === 'FillFileCompleted' ? e.file.path : ''))
    expect(paths).not.toContain(`/luts/${lutA}`)
  })

  it('a fully cached library emits nothing (a silent boot, no toast)', async () => {
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

  it('a run sweeps orphans a catalog shrink left behind (a deploy removed a LUT)', async () => {
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
  })

  it('a silent boot also sweeps orphans (full library + a stale key)', async () => {
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

  it('cube files carry their lutId; catalog and thumbnails carry null', () => {
    const files = libraryFiles(catalog)
    expect(files).toHaveLength(TOTAL)
    expect(files[0]).toEqual({ path: '/luts/film_luts.json', lutId: null })
    const cubes = files.filter((f) => f.lutId !== null)
    expect(cubes.map((c) => c.path)).toEqual([`/luts/${lutA}`, `/luts/${lutB}`])
  })

  it('waits while offline and announces Paused/Resumed around the wait', async () => {
    const connectivity = online(false)
    // The connection returns shortly after the loop starts waiting — a
    // timer, not the fetch, because the fetch only runs once the loop has
    // seen the connection again.
    const timer = setTimeout(() => connectivity.set(true), 60)
    const events = await collectEvents(opts())
    clearTimeout(timer)
    const tags = events.map((e) => e._tag)
    expect(tags).toContain('FillPaused')
    expect(tags).toContain('FillResumed')
    // The run still completed.
    expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
  })

  it('retries transient failures with backoff, then reports the file failed and continues', async () => {
    // The first cube's path fails twice, then succeeds — the retry happens
    // per file, so the other files must never see the failure mock.
    let attemptsForA = 0
    const flaky = vi.fn((path: string) => {
      if (path === `/luts/${lutA}`) {
        attemptsForA++
        if (attemptsForA < 3) return Promise.reject(new TypeError('network down'))
      }
      return Promise.resolve(new Response('bytes', { status: 200 }))
    })
    const events = await collectEvents(opts({ fetchImpl: flaky, maxAttempts: 3 }))
    expect(attemptsForA).toBe(3)
    expect(events.filter((e) => e._tag === 'FillFileFailed')).toHaveLength(0)
    expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
  })

  it('a persistently failing file is skipped (failed event) but the run completes', async () => {
    const dead = vi.fn((path: string) =>
      path === `/luts/${lutA}`
        ? Promise.reject(new TypeError('network down'))
        : Promise.resolve(new Response('bytes', { status: 200 })),
    )
    const events = await collectEvents(opts({ fetchImpl: dead, maxAttempts: 2 }))
    expect(events.filter((e) => e._tag === 'FillFileFailed')).toHaveLength(1)
    expect(events.at(-1)).toEqual({ _tag: 'FillComplete' })
  })

  it('a quota failure stops the run with FillQuotaError — no completion', async () => {
    const quotaCache = {
      ...fakeCache(),
      put: () =>
        Effect.fail(new LutCacheError({ kind: 'quota', message: 'origin storage full' })),
    }
    const events = await collectEvents(opts({ cache: quotaCache, maxAttempts: 3 }))
    expect(events.at(-1)).toMatchObject({
      _tag: 'FillQuotaError',
      message: 'origin storage full',
    })
    expect(events.some((e) => e._tag === 'FillComplete')).toBe(false)
  })

  it('an unavailable cache gate keeps the fill silent (no events at all)', async () => {
    const brokenCache = {
      ...fakeCache(),
      keys: () => Effect.fail(new LutCacheError({ kind: 'unavailable', message: 'nope' })),
    }
    const events = await collectEvents(opts({ cache: brokenCache }))
    expect(events).toEqual([])
  })

  it('pauses between batches (the throttle)', async () => {
    const slow = opts({
      cache: fakeCache(),
      fetchImpl: okFetch,
      batchSize: 1,
      batchDelay: Duration.millis(5),
    })
    const started = Date.now()
    await collectEvents(slow)
    // 5 batches × 5ms minimum — the loop actually slept between batches.
    expect(Date.now() - started).toBeGreaterThanOrEqual(20)
    expect(okFetch).toHaveBeenCalledTimes(TOTAL)
  })
})
