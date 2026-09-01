import type { ChainPass, LutId } from '@lutra/engine'

export type PassDescriptor = {
  readonly source: string
  readonly lutId: LutId | undefined
  readonly usesFrame: boolean
  readonly usesSampler: boolean
  readonly hasParams: boolean
}

export const toPassDescriptor = (pass: ChainPass): PassDescriptor => ({
  hasParams: pass.uniforms.length > 0,
  lutId: pass.lutId,
  source: pass.source,
  usesFrame: pass.usesFrame,
  usesSampler: pass.usesSampler,
})

export const descriptorCacheKey = (d: PassDescriptor): string =>
  d.lutId === undefined ? d.source : `${d.source}::lut:${d.lutId}`

export const pipelineCacheKey = (d: PassDescriptor): string => d.source
