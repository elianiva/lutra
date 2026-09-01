import type { BodyRenderer } from '../types'

// Color Mixer (Lightroom-style HSL panel, docs/adr/0003-adjustment-layers): eight hue
//
//   compile.
//   range edges.
//
const RANGES = [
  { key: 'red', left: 330, right: 15 },
  { key: 'orange', left: 15, right: 45 },
  { key: 'yellow', left: 45, right: 90 },
  { key: 'green', left: 90, right: 150 },
  { key: 'aqua', left: 150, right: 210 },
  { key: 'blue', left: 210, right: 255 },
  { key: 'purple', left: 255, right: 285 },
  { key: 'magenta', left: 285, right: 330 },
] as const

const CHANNELS = ['Hue', 'Saturation', 'Luminance'] as const

/** The normalized slider field name for a range + channel (redHue, ...). */
const field = (range: (typeof RANGES)[number], channel: (typeof CHANNELS)[number]) =>
  `${range.key}${channel}`

export const renderColorMixer: BodyRenderer = (i) => {
  const weights = RANGES.map(
    (r) =>
      `  let w${r.key[0]!.toUpperCase()}${r.key.slice(1)} = mixerWeight(h, ${r.left}.0, ${r.right}.0);`,
  ).join('\n')

  const sums = CHANNELS.map((channel) => {
    const suffix = channel === 'Hue' ? ' * 90.0' : ''
    const terms = RANGES.map(
      (r) => `l${i}_${field(r, channel)} * w${r.key[0]!.toUpperCase()}${r.key.slice(1)}`,
    ).join(' + ')
    return `    let d${channel} = (${terms})${suffix};`
  }).join('\n')

  return {
    helpers: `
const MIX_OVERLAP: f32 = 10.0;

fn mixerSrgbToLinear(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
  return select(lo, hi, c > vec3<f32>(0.04045));
}

fn mixerLinearToSrgb(c: vec3<f32>) -> vec3<f32> {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055;
  return select(lo, hi, c > vec3<f32>(0.0031308));
}

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

fn mixerWeight(h: f32, left: f32, right: f32) -> f32 {
  var hh = h;
  var ll = left;
  var rr = right;
  if (ll > rr) {
    if (hh >= right + MIX_OVERLAP && hh < left - MIX_OVERLAP) {
      return 0.0;
    }
    rr = right + 360.0;
    if (hh < right + MIX_OVERLAP) {
      hh += 360.0;
    }
  } else if (hh < ll - MIX_OVERLAP) {
    hh += 360.0;
    ll += 360.0;
    rr += 360.0;
  } else if (hh > rr + MIX_OVERLAP) {
    hh -= 360.0;
    ll -= 360.0;
    rr -= 360.0;
  }
  let rampIn = clamp((hh - (ll - MIX_OVERLAP)) / (2.0 * MIX_OVERLAP), 0.0, 1.0);
  let rampOut = clamp(((rr + MIX_OVERLAP) - hh) / (2.0 * MIX_OVERLAP), 0.0, 1.0);
  return rampIn * rampOut;
}
`,
    stmts: `
{
  let c = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
  let srgb = mixerLinearToSrgb(c);
  let hsl = mixerRgbToHsl(srgb);
  if (hsl.y > 0.001) {
    let h = hsl.x;
${weights}
${sums}
    var h2 = h + dHue;
    h2 = h2 - 360.0 * floor(h2 / 360.0);
    let s2 = clamp(hsl.y * (1.0 + dSaturation), 0.0, 1.0);
    let l2 = select(hsl.z * (1.0 + dLuminance), hsl.z + dLuminance * (1.0 - hsl.z), dLuminance >= 0.0);
    color = mixerSrgbToLinear(mixerHslToRgb(vec3<f32>(h2, s2, l2)));
  }
}
`,
  }
}
