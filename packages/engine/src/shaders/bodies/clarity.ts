import type { BodyRenderer } from "../types"

// Local contrast ("clarity"): a 9-tap box blur of the pass input
// (radius 4 px, bilinear-sampled so the sparse kernel stays smooth),
// then push pixels away from the local mean, masked to midtones. The
// pass input is the previous layer's output in linear light, so the
// neighborhood reflects all earlier adjustments.
//
// Unsharp-mask formulation: detail = color - avg; positive amount
// enhances it (structure pops), negative flattens it. The midtone mask
// keeps the effect off deep blacks and blown highlights where halos
// read as artifacts. Radius is fixed at 4 px — a true wide-radius
// clarity would need a separable blur or mip pyramid; this is the
// neighbor-sampling version the multi-pass pipeline enables.
//
// Uses textureSampleLevel with an explicit LOD: textureSample is
// fragment-stage only (implicit derivatives), and compute stages must
// request a level.
export const renderClarity: BodyRenderer = (i) => ({
  samplesInput: true,
  usesSampler: true,
  stmts: `
// clarity (local contrast)
{
  let uv = (vec2<f32>(coord) + vec2<f32>(0.5)) / u_resolution;
  let s = vec2<f32>(4.0) / u_resolution;
  let avg = (color
    + textureSampleLevel(srcTex, samp, uv + vec2<f32>(-s.x, 0.0), 0.0).rgb
    + textureSampleLevel(srcTex, samp, uv + vec2<f32>(s.x, 0.0), 0.0).rgb
    + textureSampleLevel(srcTex, samp, uv + vec2<f32>(0.0, -s.y), 0.0).rgb
    + textureSampleLevel(srcTex, samp, uv + vec2<f32>(0.0, s.y), 0.0).rgb
    + textureSampleLevel(srcTex, samp, uv + vec2<f32>(-s.x, -s.y), 0.0).rgb
    + textureSampleLevel(srcTex, samp, uv + vec2<f32>(s.x, -s.y), 0.0).rgb
    + textureSampleLevel(srcTex, samp, uv + vec2<f32>(-s.x, s.y), 0.0).rgb
    + textureSampleLevel(srcTex, samp, uv + vec2<f32>(s.x, s.y), 0.0).rgb) * (1.0 / 9.0);
  let luma = dot(avg, vec3<f32>(0.2126, 0.7152, 0.0722));
  let mask = clamp(1.0 - 4.0 * (luma - 0.5) * (luma - 0.5), 0.0, 1.0);
  color += l${i}_amount * mask * (color - avg) * 0.5;
}
`,
})
