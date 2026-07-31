import type { BodyRenderer } from "../types"

// S-curve contrast as a power curve pivoted on perceptual mid-grey
// (0.2140 in linear Rec.709 — the linear value of sRGB 0.5). Values
// below the pivot are lifted and above it are compressed for positive
// amount (film-like roll-off); negative amount steepens the curve and
// pushes tones away from the pivot. gain = exp2(-amount / 2): one stop
// of curve at each slider extreme, halved mid-slider. Input is clamped
// to >= 0 before the power so negative color (from prior layers) can't
// produce NaN.
export const renderContrast: BodyRenderer = (i) => `
// contrast (power-curve S-curve)
{
  let gain = exp2(-l${i}_amount * 0.5);
  let t = max(color, vec3<f32>(0.0)) / 0.2140;
  color = pow(t, vec3<f32>(gain)) * 0.2140;
}
`
