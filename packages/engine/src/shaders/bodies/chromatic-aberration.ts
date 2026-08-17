import type { BodyRenderer } from '../types'

// Radial chromatic aberration: R is pushed outward and B inward along
// the radial direction from the image center. The offset grows
// quadratically with distance from the center (zero at the center,
// strongest at the corners), matching real lens CA. Direction is
// computed in pixel space, so the split stays radial on any frame
// shape. `srcTex` is this pass's input — always linear light (the
// assembler inserts a linearize pass when this body runs first) — so
// sampled channels are in the same transfer function as `color`.
//
// Channels are sampled with textureSampleLevel (bilinear, binding-5
// sampler) at continuous sub-pixel offsets and replace the texel's own
// channels outright — the classic red/cyan + blue/yellow fringe look.
// Integer textureLoad offsets would quantize sub-pixel shifts to zero
// (invisible at low amounts) and alias at high amounts. The shift is
// expressed in UV space (0.03 at the normalized radius limit) so the
// split stays proportional to the frame: a fixed pixel offset would
// shrink relative to the image as resolution grows and disappear on
// high-res photos at full view. Negative amounts flip the split
// direction.
export const renderChromaticAberration: BodyRenderer = (i) => ({
  samplesInput: true,
  stmts: `
// chromatic aberration (radial)
{
  let d = vec2<f32>(coord) - u_resolution * 0.5;
  let dist = length(d);
  let dir = d / max(dist, 1.0);
  let radius = clamp(dist / min(u_resolution.x, u_resolution.y), 0.0, 1.0);
  let shift = l${i}_amount * radius * radius * 0.03;
  let uv = (vec2<f32>(coord) + vec2<f32>(0.5)) / u_resolution;
  color.r = textureSampleLevel(srcTex, samp, uv + dir * shift, 0.0).r;
  color.b = textureSampleLevel(srcTex, samp, uv - dir * shift, 0.0).b;
}
`,
  usesSampler: true,
})
