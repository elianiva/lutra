import type { BodyRenderer } from '../types'

// Multiplicative exposure in linear light. gain = 2^stops.
export const renderExposure: BodyRenderer = (i) => `
{
  let gain = exp2(l${i}_stops);
  color *= gain;
}
`
