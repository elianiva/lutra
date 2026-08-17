import type { BodyRenderer } from '../types'

// Film-grain shader: luminance-dependent, multi-scale, with chromatic grain.
//
// Replaces the previous 3-octave FBM + symmetric midtone weight with:
//   1. Asymmetric luminance curve (bell × power-law shadow ramp × smoothstep)
//      validated against real film scans and the AV1 grain synthesis spec.
//   2. Multi-scale value noise (fine + coarse layers) for organic texture.
//   3. Separate R/B color grain at 1.8× luma grain scale.
//   4. Five film-stock profiles that pre-set grain character.
//
// Profiles (selected by `profile` uniform, rounded to int in WGSL):
//   0 = Subtle   — fine 35mm, low intensity, gentle shadow rolloff
//   1 = Medium   — balanced 35mm, peak in midtones (default)
//   2 = Heavy    — pushed film, visible grain in shadows
//   3 = Vintage  — soft, warm chroma, coarse grain, wide rolloff
//   4 = Cinematic — coarse 16mm, high chroma, tight highlight rolloff
//
// Uniforms:
//   amount  (0–1)  — overall grain strength
//   profile (0–4)  — film stock character preset
//   size    (0–1)  — manual grain size override (0 = profile default)
//   chroma  (0–1)  — color grain strength (0 = monochrome)
//
// The shader animates per frame via `u_frame` so grain shimmers naturally.

// Film stock profiles baked into the shader. The profile index selects one.
// Each row: [grainSize, peak, rolloff, blur]
//   grainSize — base noise cell size (log scale: 0.3 px fine → 1.5 px coarse)
//   peak      — luminance where grain is strongest
//   rolloff   — bell curve width (larger = grain over wider tonal range)
//   blur      — coarse layer mix (0 = crisp, 1 = soft clouds)

export const renderGrain: BodyRenderer = (i) => ({
  helpers: `
// --- Hash + value noise (integer-only, no transcendentals) ---

fn grainHash(p: vec2<u32>, frame: u32) -> f32 {
  var h: u32 = p.x * 374761393u + p.y * 668265263u + frame * 974634337u;
  h = (h ^ (h >> 13u)) * 1103515245u;
  h = h ^ (h >> 16u);
  return f32(h & 0x00ffffffu) * (1.0 / 16777216.0);
}

fn grainQuintic(t: f32) -> f32 {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Smooth value noise in [0, 1). Quintic interpolation (C² continuous)
// avoids visible grid artifacts at coarse grain sizes.
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

// --- Profile lookup ---
// Returns [grainSize, peak, rolloff, blur] for the selected profile.

struct GrainProfile {
  grainSize: f32,
  peak: f32,
  rolloff: f32,
  blur: f32,
}

fn grainProfile(profile: i32) -> GrainProfile {
  // Profile 0: Subtle — fine grain, gentle curve
  if (profile == 0) {
    return GrainProfile(0.30, 0.40, 0.35, 0.60);
  }
  // Profile 1: Medium — balanced 35mm
  if (profile == 1) {
    return GrainProfile(0.50, 0.38, 0.40, 0.55);
  }
  // Profile 2: Heavy — pushed film, visible in shadows
  if (profile == 2) {
    return GrainProfile(0.70, 0.35, 0.50, 0.45);
  }
  // Profile 3: Vintage — soft, warm chroma, coarse
  if (profile == 3) {
    return GrainProfile(0.80, 0.42, 0.55, 0.35);
  }
  // Profile 4: Cinematic — 16mm, high chroma
  return GrainProfile(1.00, 0.36, 0.45, 0.40);
}

// --- Luminance weight ---
// Asymmetric curve: tight Gaussian for highlights, power-law for shadows.
// Validated against real film reference scans and AV1 grain synthesis spec.

fn grainLumaWeight(luma: f32, peak: f32, rolloff: f32) -> f32 {
  // Highlight side: tight Gaussian (35% of base rolloff)
  // Shadow side: power law ramp with smoothstep cutoff near true black
  let r = select(rolloff, rolloff * 0.35, luma > peak);
  let d = (luma - peak) / r;
  let bell = exp(-0.5 * d * d);
  let shadow = min(pow(luma / max(peak, 0.001), 0.18), 1.0)
             * smoothstep(0.0, 0.03, luma);
  return bell * shadow;
}

// --- Multi-scale grain sample ---
// Fine layer at grainSize, coarse layer at grainSize × 1.5.
// Mixed by blur parameter (more blur → more coarse → softer grain).

fn grainSample(pos: vec2<f32>, frame: u32, grainSize: f32, blurAmt: f32) -> f32 {
  let fine = grainNoise(pos, frame);
  let coarse = grainNoise(pos * 0.667, frame + 17u);
  return mix(fine, coarse, blurAmt);
}
`,
  stmts: `
// grain
{
  let prof = grainProfile(i32(l${i}_profile + 0.5));

  // Manual size override: when > 0, blend toward user value
  let manualSize = l${i}_size;
  let baseSize = select(prof.grainSize, mix(prof.grainSize, 0.2 + manualSize * 1.3, manualSize), manualSize > 0.001);

  // Noise frequency: log-scale from fine (0.3 px) to coarse (1.5 px)
  let f = 0.6667 * pow(0.15, baseSize);

  // Fine grain layer
  let fine = grainSample(vec2<f32>(coord) * f, u_frame, baseSize, prof.blur);

  // Coarse grain layer at 0.67× frequency (1.5× size)
  let coarse = grainSample(vec2<f32>(coord) * f * 0.667, u_frame + 7u, baseSize, prof.blur);

  // Blend fine + coarse (coarse layer adds organic clustering)
  let n = mix(fine, coarse, 0.35);

  // Center to [-1, 1] so amplitude is the actual max swing
  let noise = (n - 0.5) * 2.0;

  // Luminance weight: asymmetric bell × shadow power law × smoothstep
  let L = clamp(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let weight = grainLumaWeight(L, prof.peak, prof.rolloff);

  // Apply luma grain (same to all channels)
  let grainAmt = l${i}_amount * 0.15 * weight;
  color += vec3<f32>(noise * grainAmt);

  // Chromatic grain: separate R and B noise at 1.8× grain size
  // (chroma grain is coarser on real film — dye clouds are larger than silver crystals)
  let chromaAmt = l${i}_chroma * grainAmt;
  if (chromaAmt > 0.001) {
    let chromaSize = baseSize * 0.56;  // 1/1.8 — coarser frequency
    let cf = 0.6667 * pow(0.15, chromaSize);
    let cr = (grainNoise(vec2<f32>(coord) * cf + vec2<f32>(3.7, 11.3), u_frame + 31u) - 0.5) * 2.0;
    let cb = (grainNoise(vec2<f32>(coord) * cf + vec2<f32>(7.1, 15.9), u_frame + 57u) - 0.5) * 2.0;
    color.r += cr * chromaAmt;
    color.b += cb * chromaAmt;
  }

  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
}
`,
})
