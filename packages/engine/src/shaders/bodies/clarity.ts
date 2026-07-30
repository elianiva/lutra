import type { BodyRenderer } from "../types"

// PLACEHOLDER: uniform midtone lift. Real local contrast (multi-tap
// kernel with workgroup shared memory) is deferred.
export const renderClarity: BodyRenderer = (i) => `
// clarity (placeholder midtone lift; real local contrast deferred)
{
  let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  let mask = clamp(1.0 - 4.0 * (luma - 0.5) * (luma - 0.5), 0.0, 1.0);
  color += l${i}_amount * mask * 0.15;
}
`
