import type { BodyRenderer } from '../types'

// Film-grain noise: 3-octave FBM over smooth value noise, with
// midtone-weighted density. Replaces the mobile's per-pixel hash
// (fract(sin(dot(...)))) — pure white noise with no spatial coherence.
// Value noise interpolates between hashed lattice points (quintic
// easing), so adjacent pixels correlate and the grain reads as film
// grain rather than static.
//
// The lattice hash is integer-only (u32 multiplies/shifts, no
// transcendentals) and seeded with `u_frame` so the field animates per
// frame. Octaves 2 and 3 use derived frame seeds so they decorrelate
// over time.
//
// Snapseed-style knobs (replaces the original single `amount` slider):
//   - texture (0..1): strength — amplitude 0.15 × texture at full
//     slider, i.e. typical ±0.06 linear at midtone (≈±14 sRGB levels),
//     extremes ±0.15. Raised from the original 0.1 which measured only
//     ~1.4 mean sRGB levels of effect at max.
//   - size (0..1): base noise cell, log scale 1.5 px (fine) → 10 px
//     (coarse/chunky).
//   - blur (0..1): octave persistence 0.6 → 0.15. 0 = crisp speckle
//     (high octaves weighted), 1 = soft clouds (low octaves only).
//     Weights are normalized by construction (1, p, p² ÷ their sum) so
//     blur changes character, not total strength.
//
// Grain is added in linear light, so its display-space size grows
// toward the blacks (see AMD's fine-art-of-film-grain notes); the
// midtone weight floor keeps it from raising black levels outright.
export const renderGrain: BodyRenderer = (i) => ({
  // Module-scope helpers: emitted ahead of the entry point.
  helpers: `
fn grainHash(p: vec2<u32>, frame: u32) -> f32 {
  var h: u32 = p.x * 374761393u + p.y * 668265263u + frame * 974634337u;
  h = (h ^ (h >> 13u)) * 1103515245u;
  h = h ^ (h >> 16u);
  return f32(h & 0x00ffffffu) * (1.0 / 16777216.0);
}

fn grainQuintic(t: f32) -> f32 {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Smooth value noise in [0, 1). The lattice is hashed with the frame
// seed so the whole field animates between frames.
fn grainNoise(p: vec2<f32>, frame: u32) -> f32 {
  let cell = floor(p);
  let f = fract(p);
  let u = grainQuintic(f.x);
  let v = grainQuintic(f.y);
  let base = vec2<u32>(cell);
  let n00 = grainHash(base + vec2<u32>(0u, 0u), frame);
  let n10 = grainHash(base + vec2<u32>(1u, 0u), frame);
  let n01 = grainHash(base + vec2<u32>(0u, 1u), frame);
  let n11 = grainHash(base + vec2<u32>(1u, 1u), frame);
  return mix(mix(n00, n10, u), mix(n01, n11, u), v);
}
`,
  stmts: `
// grain
{
  // f = 1 / cell size: 1.5 px (size 0) → 10 px (size 1), log scale.
  // Octave frequencies are 1x, 2x, 4x of f; offsets decorrelate octaves.
  let f = 0.6667 * pow(0.15, l${i}_size);
  let p = 0.6 - 0.45 * l${i}_blur;
  let inv = 1.0 / (1.0 + p + p * p);
  let n = grainNoise(vec2<f32>(coord) * f, u_frame) * inv
        + grainNoise(vec2<f32>(coord) * f * 2.0 + vec2<f32>(7.3, 13.7), u_frame * 3u + 17u) * (p * inv)
        + grainNoise(vec2<f32>(coord) * f * 4.0 + vec2<f32>(3.1, 11.5), u_frame * 5u + 29u) * (p * p * inv);
  // Weights sum to 1 so n is in [0, 1); center and stretch to ±1 so the
  // amplitude constant below is the actual max swing at full texture.
  let noise = (n - 0.5) * 2.0;
  let L = clamp(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let w = max(1.0 - abs(L - 0.5) * 1.4, 0.35);
  color += noise * l${i}_texture * 0.15 * w;
  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
}
`,
})
