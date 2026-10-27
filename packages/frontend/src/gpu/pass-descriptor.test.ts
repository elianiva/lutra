import { describe, it, expect } from 'vitest'
import { LutId } from '@lutra/engine'
import type { ChainPass } from '@lutra/engine'
import { bindGroupCacheKey } from './pass-descriptor'

const pass = (overrides: Partial<ChainPass> = {}): ChainPass => ({
  derived: [],
  lutIds: [],
  source: 'wgsl source',
  uniformLength: 0,
  uniforms: [],
  usesSampler: false,
  ...overrides,
})

describe('bindGroupCacheKey', () => {
  it('separates the same source bound at different chain positions', () => {
    const keys = [
      bindGroupCacheKey(pass(), 0, true),
      bindGroupCacheKey(pass(), 0, false),
      bindGroupCacheKey(pass(), 1, false),
      bindGroupCacheKey(pass(), 2, false),
      bindGroupCacheKey(pass(), 2, true),
    ]
    expect(new Set(keys).size).toBe(keys.length)
    // Positions with the same ping-pong parity bind the same textures.
    expect(bindGroupCacheKey(pass(), 1, false)).toBe(bindGroupCacheKey(pass(), 3, false))
  })

  it('separates passes that bind different LUT cubes', () => {
    const a = pass({ lutIds: [LutId('a.cube')] })
    const b = pass({ lutIds: [LutId('b.cube')] })
    expect(bindGroupCacheKey(a, 1, true)).not.toBe(bindGroupCacheKey(b, 1, true))
  })
})
