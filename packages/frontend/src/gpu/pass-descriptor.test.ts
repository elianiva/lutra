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
    // SAFETY: test constructs ChainPass with string lutId; LutId is branded string, so string is assignable via never bridge in test.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, typescript/consistent-type-assertions -- SAFETY: branded LutId test value
    const d = toPassDescriptor(basePass({ source: 'a', lutId: 'cube1' as never }))
    expect(descriptorCacheKey(d)).toBe('a::lut:cube1')
    expect(pipelineCacheKey(d)).toBe('a')
  })
  it('captures usesFrame/usesSampler/hasParams', () => {
    const d = toPassDescriptor(
      // SAFETY: test stubs a uniform field; FieldKey is branded string.
      // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, typescript/consistent-type-assertions -- SAFETY: branded FieldKey test value
      basePass({ uniforms: [{ field: 'x' as never, layerIndex: 0, offset: 0 }], usesFrame: true, usesSampler: true }),
    )
    expect(d.hasParams).toBe(true)
    expect(d.usesFrame).toBe(true)
    expect(d.usesSampler).toBe(true)
  })
  it('different lutIds produce different cache keys', () => {
    // SAFETY: branded LutId test values via never bridge.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, typescript/consistent-type-assertions -- SAFETY: branded LutId test value
    const a = toPassDescriptor(basePass({ source: 'src', lutId: 'a' as never }))
    // SAFETY: branded LutId test values via never bridge.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, typescript/consistent-type-assertions -- SAFETY: branded LutId test value
    const b = toPassDescriptor(basePass({ source: 'src', lutId: 'b' as never }))
    expect(descriptorCacheKey(a)).not.toBe(descriptorCacheKey(b))
  })
})
