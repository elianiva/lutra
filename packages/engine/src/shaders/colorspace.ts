// sRGB ↔ linear conversion functions for WGSL. Embedded verbatim into
// every generated chain shader so every body can call srgbToLinear
// and linearToSrgb.
//
// Piecewise IEC 61966-2-1 sRGB curve — not the cheaper pow(2.2)
// approximation. The 0.04045 / 0.0031308 break points are the actual
// sRGB standard; pow(2.2) is off by ~1% in the toe and shoulder.
//
// Vectorized: a single `select` + `pow` on vec3<f32> instead of three
// per-channel branches. WGSL `select` operates component-wise, so this
// is the same math as the per-channel form but lets the driver emit
// SIMD-packed comparisons and pow.
export const SRGB_TO_LINEAR = `
fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
  return select(lo, hi, c > vec3<f32>(0.04045));
}

fn linearToSrgb(c: vec3<f32>) -> vec3<f32> {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055;
  return select(lo, hi, c > vec3<f32>(0.0031308));
}
`
