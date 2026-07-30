import type { BodyRenderer } from "../types"

// Film-grain noise with density weighting. Uses a hash-based noise
// function with triangular midtone falloff (peak at 0.5, floor at
// 0.35) so deep blacks and bright highlights stay clean while noise
// concentrates where film grain is most visible.
//
// The hash is a simple 3D permutation: fract(sin(dot(...)) * 43758.5453)
// with a time-based seed (`u_frame` uniform) for animation per frame.
// This is a stepping stone toward proper FBM grain; the compute shader
// path leaves the door open for shared-memory FBM later.
export const renderGrain: BodyRenderer = (i) => `
// grain
{
  var n = fract(sin(dot(vec3<f32>(f32(coord.x), f32(coord.y), 0.0), vec3<f32>(12.9898, 78.233, 45.164))) * 43758.5453 + f32(u_frame) * 0.618);
  n = fract(n * 93.431);
  let noise = n - 0.5;
  let L = clamp(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let w = max(1.0 - abs(L - 0.5) * 1.4, 0.35);
  color += noise * l${i}_amount * w;
  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
}
`
