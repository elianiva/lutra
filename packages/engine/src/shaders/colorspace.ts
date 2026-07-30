// sRGB ↔ linear conversion functions for WGSL. Embedded verbatim into
// every generated chain shader so every body can call srgbToLinear
// and linearToSrgb.
//
// Piecewise IEC 61966-2-1 sRGB curve — not the cheaper pow(2.2)
// approximation. The 0.04045 / 0.0031308 break points are the actual
// sRGB standard; pow(2.2) is off by ~1% in the toe and shoulder.
export const SRGB_TO_LINEAR = `
fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    select(c.r / 12.92, pow((c.r + 0.055) / 1.055, 2.4), c.r > 0.04045),
    select(c.g / 12.92, pow((c.g + 0.055) / 1.055, 2.4), c.g > 0.04045),
    select(c.b / 12.92, pow((c.b + 0.055) / 1.055, 2.4), c.b > 0.04045),
  );
}

fn linearToSrgb(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    select(c.r * 12.92, 1.055 * pow(c.r, 1.0 / 2.4) - 0.055, c.r > 0.0031308),
    select(c.g * 12.92, 1.055 * pow(c.g, 1.0 / 2.4) - 0.055, c.g > 0.0031308),
    select(c.b * 12.92, 1.055 * pow(c.b, 1.0 / 2.4) - 0.055, c.b > 0.0031308),
  );
}
`
