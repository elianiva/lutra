import { type BodyRenderer } from "../format";

// Multiplicative exposure in linear light. gain = 2^stops, applied once
// at the source. The math is identical to a per-layer pass; F just
// collapses N round-trips into one.
export const renderExposure: BodyRenderer = (i) => `
// exposure
{
  half gain = exp2(l${i}_stops);
  color *= half(gain);
}
`;
