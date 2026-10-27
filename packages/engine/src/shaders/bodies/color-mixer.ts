import type { BodyRenderer } from '../types'

export type MixerRange = {
  readonly key: string
  readonly left: number
  readonly right: number
}

export const MIX_OVERLAP = 10.0 as const

export const RANGES = [
  { key: 'red', left: 330, right: 15 },
  { key: 'orange', left: 15, right: 45 },
  { key: 'yellow', left: 45, right: 90 },
  { key: 'green', left: 90, right: 150 },
  { key: 'aqua', left: 150, right: 210 },
  { key: 'blue', left: 210, right: 255 },
  { key: 'purple', left: 255, right: 285 },
  { key: 'magenta', left: 285, right: 330 },
] as const satisfies readonly MixerRange[]

export const wrapHueForRange = (
  h: number,
  left: number,
  right: number,
): [number, number, number] => {
  let hh = h
  let ll = left
  let rr = right
  if (ll > rr) {
    rr = right + 360
    if (hh < right + MIX_OVERLAP) hh += 360
  } else if (hh < ll - MIX_OVERLAP) {
    hh += 360
    ll += 360
    rr += 360
  } else if (hh > rr + MIX_OVERLAP) {
    hh -= 360
    ll -= 360
    rr -= 360
  }
  return [hh, ll, rr]
}

export const overlapWeight = (h: number, left: number, right: number): number => {
  if (left > right && h >= right + MIX_OVERLAP && h < left - MIX_OVERLAP) return 0
  const [hh, ll, rr] = wrapHueForRange(h, left, right)
  const rampIn = Math.min(1, Math.max(0, (hh - (ll - MIX_OVERLAP)) / (2 * MIX_OVERLAP)))
  const rampOut = Math.min(1, Math.max(0, (rr + MIX_OVERLAP - hh) / (2 * MIX_OVERLAP)))
  return rampIn * rampOut
}

/**
 * Per-degree hue deltas (vec4: hue°, saturation, luminance, unused) for
 * hues 0..359. Every range edge sits on a whole degree and the weights are
 * linear between edges, so interpolating adjacent entries reproduces the
 * per-pixel weighting exactly — the shader does one lookup instead of
 * eight range weights.
 */
const HUE_TABLE_SIZE = 360

export const renderColorMixer: BodyRenderer = (i) => ({
  derived: {
    compute: (field) => {
      const table = new Float32Array(HUE_TABLE_SIZE * 4)
      const deltas = RANGES.map((r) => ({
        hue: field(`${r.key}Hue`),
        luminance: field(`${r.key}Luminance`),
        range: r,
        saturation: field(`${r.key}Saturation`),
      }))
      for (let h = 0; h < HUE_TABLE_SIZE; h++) {
        let hue = 0
        let saturation = 0
        let luminance = 0
        for (const d of deltas) {
          const w = overlapWeight(h, d.range.left, d.range.right)
          hue += d.hue * w
          saturation += d.saturation * w
          luminance += d.luminance * w
        }
        table.set([hue * 90, saturation, luminance], h * 4)
      }
      return table
    },
    length: HUE_TABLE_SIZE,
  },
  helpers: `
fn mixerRgbToHsl(c: vec3<f32>) -> vec3<f32> {
  let maxc = max(c.r, max(c.g, c.b));
  let minc = min(c.r, min(c.g, c.b));
  let chroma = maxc - minc;
  let l = (maxc + minc) * 0.5;
  var h: f32 = 0.0;
  if (chroma > 0.0) {
    if (maxc == c.r) {
      h = 60.0 * ((c.g - c.b) / chroma);
      if (h < 0.0) { h += 360.0; }
    } else if (maxc == c.g) {
      h = 60.0 * ((c.b - c.r) / chroma + 2.0);
    } else {
      h = 60.0 * ((c.r - c.g) / chroma + 4.0);
    }
  }
  let denom = 1.0 - abs(2.0 * l - 1.0);
  let s = select(0.0, chroma / denom, denom > 0.0);
  return vec3<f32>(h, s, l);
}

fn mixerHslToRgb(hsl: vec3<f32>) -> vec3<f32> {
  let h = hsl.x;
  let c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  let hp = h / 60.0;
  let x = c * (1.0 - abs(hp - 2.0 * floor(hp / 2.0) - 1.0));
  var rgb: vec3<f32>;
  if (hp < 1.0) {
    rgb = vec3<f32>(c, x, 0.0);
  } else if (hp < 2.0) {
    rgb = vec3<f32>(x, c, 0.0);
  } else if (hp < 3.0) {
    rgb = vec3<f32>(0.0, c, x);
  } else if (hp < 4.0) {
    rgb = vec3<f32>(0.0, x, c);
  } else if (hp < 5.0) {
    rgb = vec3<f32>(x, 0.0, c);
  } else {
    rgb = vec3<f32>(c, 0.0, x);
  }
  let m = hsl.z - c * 0.5;
  return rgb + vec3<f32>(m);
}
`,
  stmts: `
{
  let c = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
  let srgb = linearToSrgb(c);
  let hsl = mixerRgbToHsl(srgb);
  if (hsl.y > 0.001) {
    let h = hsl.x;
    let k = u32(floor(h)) % ${HUE_TABLE_SIZE}u;
    let d = mix(
      u_params.l${i}_derived[k],
      u_params.l${i}_derived[(k + 1u) % ${HUE_TABLE_SIZE}u],
      h - floor(h),
    );
    let dHue = d.x;
    let dSaturation = d.y;
    let dLuminance = d.z;
    var h2 = h + dHue;
    h2 = h2 - 360.0 * floor(h2 / 360.0);
    let s2 = clamp(hsl.y * (1.0 + dSaturation), 0.0, 1.0);
    let l2 = select(hsl.z * (1.0 + dLuminance), hsl.z + dLuminance * (1.0 - hsl.z), dLuminance >= 0.0);
    color = srgbToLinear(mixerHslToRgb(vec3<f32>(h2, s2, l2)));
  }
}
`,
})
