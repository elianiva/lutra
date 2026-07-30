import type { BodyRenderer } from "../types"

// S-curve around perceptual mid-grey (0.2140 in linear Rec.709), not
// 0.5 in sRGB. Clamped to ±0.99 to avoid division by zero.
export const renderContrast: BodyRenderer = (i) => `
// contrast
{
  let amt = clamp(l${i}_amount, -0.99, 0.99);
  let factor = select(1.0 / (1.0 - amt), 1.0 + amt, amt > 0.0);
  color = (color - 0.2140) * factor + 0.2140;
}
`
