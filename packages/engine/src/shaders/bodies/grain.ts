import type { BodyRenderer } from '../types'

export const HIGHLIGHT_ROLLOFF_FACTOR = 0.35 as const
export const SHADOW_POWER = 0.18 as const
export const BLACK_CUTOFF = 0.03 as const

export const renderGrain: BodyRenderer = (i) => ({
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


struct GrainProfile {
  grainSize: f32,
  peak: f32,
  rolloff: f32,
  blur: f32,
}

fn grainProfile(profile: i32) -> GrainProfile {
  if (profile == 0) {
    return GrainProfile(0.30, 0.40, 0.35, 0.60);
  }
  if (profile == 1) {
    return GrainProfile(0.50, 0.38, 0.40, 0.55);
  }
  if (profile == 2) {
    return GrainProfile(0.70, 0.35, 0.50, 0.45);
  }
  if (profile == 3) {
    return GrainProfile(0.80, 0.42, 0.55, 0.35);
  }
  return GrainProfile(1.00, 0.36, 0.45, 0.40);
}


fn grainLumaWeight(luma: f32, peak: f32, rolloff: f32) -> f32 {
  let r = select(rolloff, rolloff * ${HIGHLIGHT_ROLLOFF_FACTOR}, luma > peak);
  let d = (luma - peak) / r;
  let bell = exp(-0.5 * d * d);
  let shadow = min(pow(luma / max(peak, 0.001), ${SHADOW_POWER}), 1.0)
             * smoothstep(0.0, ${BLACK_CUTOFF}, luma);
  return bell * shadow;
}


fn grainSample(pos: vec2<f32>, frame: u32, grainSize: f32, blurAmt: f32) -> f32 {
  let fine = grainNoise(pos, frame);
  let coarse = grainNoise(pos * 0.667, frame + 17u);
  return mix(fine, coarse, blurAmt);
}
`,
  stmts: `
{
  let prof = grainProfile(i32(l${i}_profile + 0.5));

  let manualSize = l${i}_size;
  let baseSize = select(prof.grainSize, mix(prof.grainSize, 0.2 + manualSize * 1.3, manualSize), manualSize > 0.001);

  let f = 0.6667 * pow(0.15, baseSize);

  let fine = grainSample(vec2<f32>(coord) * f, u_frame, baseSize, prof.blur);

  let coarse = grainSample(vec2<f32>(coord) * f * 0.667, u_frame + 7u, baseSize, prof.blur);

  let n = mix(fine, coarse, 0.35);

  let noise = (n - 0.5) * 2.0;

  let L = clamp(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let weight = grainLumaWeight(L, prof.peak, prof.rolloff);

  let grainAmt = l${i}_amount * 0.15 * weight;
  color += vec3<f32>(noise * grainAmt);

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
