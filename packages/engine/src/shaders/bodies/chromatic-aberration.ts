import type { BodyRenderer } from "../types"

// Radial chromatic aberration: R is pushed outward and B inward along
// the radial direction from the image center. The offset grows
// quadratically with distance from the center (zero at the center,
// strongest at the corners), matching real lens CA. Direction is
// computed in pixel space, so the split stays radial on any frame
// shape. `srcTex` is this pass's input — always linear light (the
// assembler inserts a linearize pass when this body runs first) — so
// sampled channels are in the same transfer function as `color`.
// `strength` blends the shifted channel in, so sub-pixel amounts still
// register smoothly as the slider moves.
export const renderChromaticAberration: BodyRenderer = (i) => ({
  samplesInput: true,
  stmts: `
// chromatic aberration (radial)
{
  let d = vec2<f32>(coord) - u_resolution * 0.5;
  let dist = length(d);
  let dir = d / max(dist, 1.0);
  let radius = dist / min(u_resolution.x, u_resolution.y);
  let shift = l${i}_amount * radius * radius * 4.0;
  let rOffset = vec2<i32>(round(dir * shift));
  let rCoord = clamp(vec2<i32>(coord) + rOffset, vec2<i32>(0), vec2<i32>(u_resolution) - 1);
  let bCoord = clamp(vec2<i32>(coord) - rOffset, vec2<i32>(0), vec2<i32>(u_resolution) - 1);
  let rVal = textureLoad(srcTex, rCoord, 0).r;
  let bVal = textureLoad(srcTex, bCoord, 0).b;
  let strength = abs(l${i}_amount);
  color.r = mix(color.r, rVal, strength);
  color.b = mix(color.b, bVal, strength);
}
`,
})
