import type { BodyRenderer } from "../types"

// Temp shifts R and B in opposite directions; tint shifts G with a
// smaller R/B pull. Multiplicative in linear light. temp: -1 cool /
// +1 warm, tint: -1 magenta / +1 green, both 0 = neutral.
export const renderWhiteBalance: BodyRenderer = (i) => `
// white balance
{
  let temp = l${i}_temp;
  let tint = l${i}_tint;
  color.r *= 1.0 - temp * 0.3;
  color.b *= 1.0 + temp * 0.3;
  color.g *= 1.0 + tint * 0.2;
  color.r *= 1.0 - tint * 0.1;
  color.b *= 1.0 - tint * 0.1;
}
`
