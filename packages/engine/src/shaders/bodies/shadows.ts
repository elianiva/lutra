import type { BodyRenderer } from "../types"

// Shadow lift. Mask is 1 at black, falls to 0 by mid-grey.
// 0.15 multiplier tuned for -1..+1 slider range.
export const renderShadows: BodyRenderer = (i) => `
// shadows
{
  let luma = clamp(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let mask = 1.0 - smoothstep(0.0, 0.5, luma);
  color += l${i}_amount * 0.15 * mask;
}
`
