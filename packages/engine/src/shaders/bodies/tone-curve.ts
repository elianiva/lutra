import type { BodyRenderer } from '../types'

// Tone curve (docs/adr/0003-adjustment-layers): a monotone cubic Hermite spline mapping
// through 5 control points (p0..p4, x-ordered), applied per channel.
//
// The curve operates on sRGB-encoded values — the widget's coordinates are
// display values (the identity curve is the diagonal, an S-curve drags
// midtones), and every mainstream curves tool grades in gamma-encoded
// space. The body round-trips the linear-light pixel through sRGB with its
// own curve-prefixed helpers: the pass template only embeds
// srgbToLinear/linearToSrgb at chain ends, so a middle-of-chain curve must
// be self-contained (and duplicate function names would fail to compile).
//
// Evaluation uses monotone cubic Hermite interpolation (Fritsch-Carlson
// method): tangents at interior points are weighted averages of adjacent
// segment slopes, clamped to prevent overshoot. This means dragging one
// point smoothly reshapes the entire curve — not just the adjacent
// segments — matching the behavior of Lightroom, Capture One, and
// darktable. Inputs below the black anchor clamp to its output, above the
// white anchor to its output. Values outside [0, 1] are clamped before the
// sRGB round-trip (the same clamp the display encode path applies), like
// the Color Mixer.
export const renderToneCurve: BodyRenderer = (i) => {
  // Interleaved x/y uniforms, matching curveTangents/curveSpline's
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

// Monotone cubic Hermite spline through 5 x-ordered control points
// (Fritsch-Carlson method). Tangents at interior points are weighted
// averages of adjacent segment slopes, clamped to prevent overshoot.
// This makes dragging one point smoothly reshape the entire curve.
fn curveTangents(x0: f32, y0: f32, x1: f32, y1: f32, x2: f32, y2: f32, x3: f32, y3: f32, x4: f32, y4: f32) -> vec3<f32> {
  let e = 1e-5;
  let s0 = (y1 - y0) / max(x1 - x0, e);
  let s1 = (y2 - y1) / max(x2 - x1, e);
  let s2 = (y3 - y2) / max(x3 - x2, e);
  let s3 = (y4 - y3) / max(x4 - x3, e);

  // Interior tangents: weighted harmonic mean of adjacent slopes.
  // When consecutive slopes have opposite signs the tangent is zero
  // (the curve must flatten to stay monotone).
  var t1: f32;
  if (s0 * s1 <= 0.0) {
    t1 = 0.0;
  } else {
    t1 = (2.0 * s0 * s1) / (s0 + s1);
  }

  var t2: f32;
  if (s1 * s2 <= 0.0) {
    t2 = 0.0;
  } else {
    t2 = (2.0 * s1 * s2) / (s1 + s2);
  }

  var t3: f32;
  if (s2 * s3 <= 0.0) {
    t3 = 0.0;
  } else {
    t3 = (2.0 * s2 * s3) / (s2 + s3);
  }

  // Fritsch-Carlson clamp: if α² + β² > 9, scale tangents down to
  // prevent overshoot while preserving direction.
  let a1 = select(0.0, t1 / s1, abs(s1) > e);
  let b1 = select(0.0, t2 / s1, abs(s1) > e);
  let sum1 = a1 * a1 + b1 * b1;
  if (sum1 > 9.0) {
    let tau = 3.0 / sqrt(sum1);
    t1 = tau * a1 * s1;
    t2 = tau * b1 * s1;
  }

  let a2 = select(0.0, t2 / s2, abs(s2) > e);
  let b2 = select(0.0, t3 / s2, abs(s2) > e);
  let sum2 = a2 * a2 + b2 * b2;
  if (sum2 > 9.0) {
    let tau = 3.0 / sqrt(sum2);
    t2 = tau * a2 * s2;
    t3 = tau * b2 * s2;
  }

  return vec3<f32>(t1, t2, t3);
}

// Evaluate the monotone cubic Hermite spline at t, given the 5 control
// points and precomputed interior tangents. Flat below the first point
// and above the last.
fn curveSpline(t: f32, x0: f32, y0: f32, x1: f32, y1: f32, x2: f32, y2: f32, x3: f32, y3: f32, x4: f32, y4: f32, tangents: vec3<f32>) -> f32 {
  let e = 1e-5;
  if (t <= x0) { return y0; }
  if (t < x1) {
    let dx = max(x1 - x0, e);
    let s = (t - x0) / dx;
    let s2 = s * s;
    let s3 = s2 * s;
    return (2.0 * s3 - 3.0 * s2 + 1.0) * y0 +
           (s3 - 2.0 * s2 + s) * dx * tangents.x +
           (-2.0 * s3 + 3.0 * s2) * y1 +
           (s3 - s2) * dx * tangents.x;
  }
  if (t < x2) {
    let dx = max(x2 - x1, e);
    let s = (t - x1) / dx;
    let s2 = s * s;
    let s3 = s2 * s;
    return (2.0 * s3 - 3.0 * s2 + 1.0) * y1 +
           (s3 - 2.0 * s2 + s) * dx * tangents.x +
           (-2.0 * s3 + 3.0 * s2) * y2 +
           (s3 - s2) * dx * tangents.y;
  }
  if (t < x3) {
    let dx = max(x3 - x2, e);
    let s = (t - x2) / dx;
    let s2 = s * s;
    let s3 = s2 * s;
    return (2.0 * s3 - 3.0 * s2 + 1.0) * y2 +
           (s3 - 2.0 * s2 + s) * dx * tangents.y +
           (-2.0 * s3 + 3.0 * s2) * y3 +
           (s3 - s2) * dx * tangents.z;
  }
  if (t < x4) {
    let dx = max(x4 - x3, e);
    let s = (t - x3) / dx;
    let s2 = s * s;
    let s3 = s2 * s;
    return (2.0 * s3 - 3.0 * s2 + 1.0) * y3 +
           (s3 - 2.0 * s2 + s) * dx * tangents.z +
           (-2.0 * s3 + 3.0 * s2) * y4 +
           (s3 - s2) * dx * tangents.z;
  }
  return y4;
}
`,
    stmts: `
// tone curve — monotone cubic Hermite spline
{
  let c = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
  let srgb = curveLinearToSrgb(c);
  let tangents = curveTangents(${params});
  color = curveSrgbToLinear(vec3<f32>(
    curveSpline(srgb.r, ${params}, tangents),
    curveSpline(srgb.g, ${params}, tangents),
    curveSpline(srgb.b, ${params}, tangents),
  ));
}
`,
  }
}
