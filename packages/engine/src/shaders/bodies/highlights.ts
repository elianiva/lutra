import type { BodyRenderer } from "../types"

// Highlight lift. Mask rises from 0 at mid-grey to 1 at white
// (softened with pow 2.2). 0.2 multiplier tuned for -1..+1 range.
export const renderHighlights: BodyRenderer = (i) => `
// highlights
{
  let luma = clamp(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let mask = pow(luma, 2.2);
  color += l${i}_amount * 0.2 * mask;
}
`
