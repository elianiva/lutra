import type { BodyRenderer } from "../types"

// Film-grain noise with density weighting. Uses an integer hash
// (Wang-style) with triangular midtone falloff (peak at 0.5, floor at
// 0.35) so deep blacks and bright highlights stay clean while noise
// concentrates where film grain is most visible.
//
// The mobile SkSL used fract(sin(dot(...))) — a transcendental per
// pixel that costs several ALU ops. Integer hash is bit-twiddling
// only: u32 multiplies and shifts, no transcendentals. The frame
// counter (`u_frame`) seeds the hash so the noise animates per frame.
// This is a stepping stone toward proper FBM grain; the compute shader
// path leaves the door open for shared-memory FBM later.
export const renderGrain: BodyRenderer = (i) => `
// grain
{
  var h: u32 = coord.x * 374761393u + coord.y * 668265263u + u_frame * 974634337u;
  h = (h ^ (h >> 13u)) * 1103515245u;
  h = h ^ (h >> 16u);
  let n = f32(h & 0x00ffffffu) * (1.0 / 16777216.0);
  let noise = n - 0.5;
  let L = clamp(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let w = max(1.0 - abs(L - 0.5) * 1.4, 0.35);
  color += noise * l${i}_amount * w;
  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
}
`
