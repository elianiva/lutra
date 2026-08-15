import type { BodyRenderer } from '../types'

// Tone curve (docs/adr/0028): a piecewise-linear mapping through 5 control
// points (p0..p4, x-ordered), applied per channel.
//
// The curve operates on sRGB-encoded values — the widget's coordinates are
// display values (the identity curve is the diagonal, an S-curve drags
// midtones), and every mainstream curves tool grades in gamma-encoded
// space. The body round-trips the linear-light pixel through sRGB with its
// own curve-prefixed helpers: the pass template only embeds
// srgbToLinear/linearToSrgb at chain ends, so a middle-of-chain curve must
// be self-contained (and duplicate function names would fail to compile).
//
// Evaluation is exact piecewise-linear between points — the widget draws
// the same polyline, so what you drag is what the shader computes. Inputs
// below the black anchor clamp to its output, above the white anchor to
// its output; segment denominators are floored so degenerate (stacked)
// x's can never produce NaN. Values outside [0, 1] are clamped before the
// sRGB round-trip (the same clamp the display encode path applies), like
// the Color Mixer.
export const renderToneCurve: BodyRenderer = (i) => {
  // Interleaved x/y uniforms, matching curveEval's (x0, y0, x1, y1, …)
  // parameter order: l{i}_p0x, l{i}_p0y, …, l{i}_p4x, l{i}_p4y.
  const params = Array.from({ length: 5 }, (_, n) => `l${i}_p${n}x, l${i}_p${n}y`).join(', ')
  return {
    helpers: `
fn curveSrgbToLinear(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
  return select(lo, hi, c > vec3<f32>(0.04045));
}

fn curveLinearToSrgb(c: vec3<f32>) -> vec3<f32> {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055;
  return select(lo, hi, c > vec3<f32>(0.0031308));
}

// Piecewise-linear evaluation through the 5 x-ordered points (x0 < x1 < x2
// < x3 < x4). Flat below the first and above the last; linear segments
// between. The 1e-5 floor keeps a degenerate (stacked-x) segment from
// dividing by zero — the segment is never actually entered in that case
// (t <= x0 returns first), so the floor is belt-and-suspenders.
fn curveEval(t: f32, x0: f32, y0: f32, x1: f32, y1: f32, x2: f32, y2: f32, x3: f32, y3: f32, x4: f32, y4: f32) -> f32 {
  if (t <= x0) {
    return y0;
  }
  if (t < x1) {
    return mix(y0, y1, (t - x0) / max(x1 - x0, 1e-5));
  }
  if (t < x2) {
    return mix(y1, y2, (t - x1) / max(x2 - x1, 1e-5));
  }
  if (t < x3) {
    return mix(y2, y3, (t - x2) / max(x3 - x2, 1e-5));
  }
  if (t < x4) {
    return mix(y3, y4, (t - x3) / max(x4 - x3, 1e-5));
  }
  return y4;
}
`,
    stmts: `
// tone curve
{
  let c = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
  let srgb = curveLinearToSrgb(c);
  color = curveSrgbToLinear(vec3<f32>(
    curveEval(srgb.r, ${params}),
    curveEval(srgb.g, ${params}),
    curveEval(srgb.b, ${params}),
  ));
}
`,
  }
}
