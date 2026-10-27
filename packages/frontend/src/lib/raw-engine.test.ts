import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoolEngine } from './raw-engine'
import type { RawPool } from './raw-engine'

// The pool engine owns the worker's lifetime: one pool, created on first use,
// terminated after it has been idle (docs/adr/0008-raw-decode).

const IDLE_MS = 30_000

const fakePool = () => {
  const terminate = vi.fn()
  const pool: RawPool = {
    getCapabilities: async () => ({}),
    open: async () => ({
      close: vi.fn(),
      decode: async () => ({ data: new Uint8ClampedArray(4), height: 1, width: 1 }),
      metadata: { height: 1, width: 1 },
      preview: async () => null,
    }),
    terminate,
  }
  return { pool, terminate }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createPoolEngine', () => {
  it('terminates the pool after it has been idle and builds a fresh one on the next use', async () => {
    const first = fakePool()
    const second = fakePool()
    const pools = [first, second]
    const createPool = vi.fn(() => {
      const next = pools.shift()
      if (next === undefined) {
        throw new Error('no pool left')
      }
      return next.pool
    })
    const engine = createPoolEngine(createPool, IDLE_MS)

    await engine.withSession(new Blob(), async () => undefined)
    await engine.withSession(new Blob(), async () => undefined)
    expect(createPool).toHaveBeenCalledTimes(1)
    expect(first.terminate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(first.terminate).toHaveBeenCalledTimes(1)

    await engine.withSession(new Blob(), async () => undefined)
    expect(createPool).toHaveBeenCalledTimes(2)
    expect(second.terminate).not.toHaveBeenCalled()
  })

  it('does not terminate while a session is still open', async () => {
    const { pool, terminate } = fakePool()
    const engine = createPoolEngine(() => pool, IDLE_MS)

    const open = engine.withSession(new Blob(), async () => {
      await vi.advanceTimersByTimeAsync(IDLE_MS * 2)
    })
    await open
    expect(terminate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('warming starts the worker before any decode and lets it idle out', async () => {
    const { pool, terminate } = fakePool()
    const createPool = vi.fn(() => pool)
    createPoolEngine(createPool, IDLE_MS).warm()
    expect(createPool).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(terminate).toHaveBeenCalledTimes(1)
  })
})
