import { describe, it, expect } from 'vitest'
import { descriptorCacheKey, pipelineCacheKey, toPassDescriptor } from './pass-descriptor'
import type { ChainPass } from '@lutra/engine'

const basePass = (overrides: Partial<ChainPass> = {}): ChainPass => ({
  source: 'wgsl source',
  uniforms: [],
  usesFrame: false,
  usesSampler: false,
  ...overrides,
})

describe('pass-descriptor', () => {
  it('maps source without lut to cache key', () => {
    const d = toPassDescriptor(basePass({ source: 'a' }))
    expect(descriptorCacheKey(d)).toBe('a')
    expect(pipelineCacheKey(d)).toBe('a')
  })
  it('includes lutId in descriptor cache key', () => {
    const d = toPassDescriptor(basePass({ source: 'a', lutId: 'cube1' as never }))
    expect(descriptorCacheKey(d)).toBe('a::lut:cube1')
    expect(pipelineCacheKey(d)).toBe('a')
  })
  it('captures usesFrame/usesSampler/hasParams', () => {
    const d = toPassDescriptor(
      basePass({ uniforms: [{ field: 'x' as never, layerIndex: 0, offset: 0 }], usesFrame: true, usesSampler: true }),
    )
    expect(d.hasParams).toBe(true)
    expect(d.usesFrame).toBe(true)
    expect(d.usesSampler).toBe(true)
  })
  it('different lutIds produce different cache keys', () => {
    const a = toPassDescriptor(basePass({ source: 'src', lutId: 'a' as never }))
    const b = toPassDescriptor(basePass({ source: 'src', lutId: 'b' as never }))
    expect(descriptorCacheKey(a)).not.toBe(descriptorCacheKey(b))
  })
})
