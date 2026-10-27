import type { ChainPass } from '@lutra/engine'

/**
 * Bind-group cache key for one compute pass. Pass sources do not encode
 * chain position (the same run of layers compiles to the same WGSL anywhere
 * in the chain), so the key adds what the bind group pins: the input and
 * output textures the pass's index selects, and the LUT cubes it binds.
 */
export const bindGroupCacheKey = (pass: ChainPass, index: number, isLast: boolean): string => {
  const input = index === 0 ? 'source' : `ping${(index - 1) % 2}`
  const output = isLast ? 'display' : `ping${index % 2}`
  return `${input}>${output}|${pass.lutIds.join(',')}|${pass.source}`
}
