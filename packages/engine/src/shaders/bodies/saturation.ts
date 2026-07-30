import type { BodyRenderer } from "../types"

// Rec.709 luma mix in linear light. amount=0 is identity; +1 doubles
// chroma, -1 zeroes it.
export const renderSaturation: BodyRenderer = (i) => `
// saturation
{
  let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  color = mix(vec3<f32>(luma), color, 1.0 + l${i}_amount);
}
`
