import type { BodyRenderer } from '../types'

export type FritschCarlsonTangents = {
  readonly t1: number
  readonly t2: number
  readonly t3: number
}

export const hermiteBasis = (s: number): readonly [number, number, number, number] => {
  const s2 = s * s
  const s3 = s2 * s
  return [2 * s3 - 3 * s2 + 1, s3 - 2 * s2 + s, -2 * s3 + 3 * s2, s3 - s2] as const
}

export const HERMITE_BASIS_WGSL = `
fn hermiteBasis(s: f32) -> vec4<f32> {
  let s2 = s * s;
  let s3 = s2 * s;
  return vec4<f32>(2.0 * s3 - 3.0 * s2 + 1.0, s3 - 2.0 * s2 + s, -2.0 * s3 + 3.0 * s2, s3 - s2);
}
`

/**
 * Fritsch–Carlson monotone tangents at the three interior points of the
 * 5-point curve. They depend only on the control points, so they are
 * computed once per render on the CPU (a derived uniform) rather than per
 * pixel.
 */
export const curveTangents = (
  xs: readonly number[],
  ys: readonly number[],
): FritschCarlsonTangents => {
  const e = 1e-5
  const s = [0, 1, 2, 3].map((k) => (ys[k + 1]! - ys[k]!) / Math.max(xs[k + 1]! - xs[k]!, e))
  const harmonic = (a: number, b: number) => (a * b <= 0 ? 0 : (2 * a * b) / (a + b))
  let t1 = harmonic(s[0]!, s[1]!)
  let t2 = harmonic(s[1]!, s[2]!)
  let t3 = harmonic(s[2]!, s[3]!)
  const a1 = Math.abs(s[1]!) > e ? t1 / s[1]! : 0
  const b1 = Math.abs(s[1]!) > e ? t2 / s[1]! : 0
  const sum1 = a1 * a1 + b1 * b1
  if (sum1 > 9) {
    const tau = 3 / Math.sqrt(sum1)
    t1 = tau * a1 * s[1]!
    t2 = tau * b1 * s[1]!
  }
  const a2 = Math.abs(s[2]!) > e ? t2 / s[2]! : 0
  const b2 = Math.abs(s[2]!) > e ? t3 / s[2]! : 0
  const sum2 = a2 * a2 + b2 * b2
  if (sum2 > 9) {
    const tau = 3 / Math.sqrt(sum2)
    t2 = tau * a2 * s[2]!
    t3 = tau * b2 * s[2]!
  }
  return { t1, t2, t3 }
}

const POINTS = [0, 1, 2, 3, 4] as const

export const renderToneCurve: BodyRenderer = (i) => {
  const params = POINTS.map((n) => `l${i}_p${n}x, l${i}_p${n}y`).join(', ')
  return {
    derived: {
      compute: (field) => {
        const { t1, t2, t3 } = curveTangents(
          POINTS.map((n) => field(`p${n}x`)),
          POINTS.map((n) => field(`p${n}y`)),
        )
        return new Float32Array([t1, t2, t3, 0])
      },
      length: 1,
    },
    helpers: `
${HERMITE_BASIS_WGSL}
fn curveSpline(t: f32, x0: f32, y0: f32, x1: f32, y1: f32, x2: f32, y2: f32, x3: f32, y3: f32, x4: f32, y4: f32, tangents: vec3<f32>) -> f32 {
  let e = 1e-5;
  if (t <= x0) { return y0; }
  if (t < x1) {
    let dx = max(x1 - x0, e);
    let s = (t - x0) / dx;
    let h = hermiteBasis(s);
    return h.x * y0 + h.y * dx * tangents.x + h.z * y1 + h.w * dx * tangents.x;
  }
  if (t < x2) {
    let dx = max(x2 - x1, e);
    let s = (t - x1) / dx;
    let h = hermiteBasis(s);
    return h.x * y1 + h.y * dx * tangents.x + h.z * y2 + h.w * dx * tangents.y;
  }
  if (t < x3) {
    let dx = max(x3 - x2, e);
    let s = (t - x2) / dx;
    let h = hermiteBasis(s);
    return h.x * y2 + h.y * dx * tangents.y + h.z * y3 + h.w * dx * tangents.z;
  }
  if (t < x4) {
    let dx = max(x4 - x3, e);
    let s = (t - x3) / dx;
    let h = hermiteBasis(s);
    return h.x * y3 + h.y * dx * tangents.z + h.z * y4 + h.w * dx * tangents.z;
  }
  return y4;
}
`,
    stmts: `
{
  let c = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
  let srgb = linearToSrgb(c);
  let tangents = u_params.l${i}_derived[0].xyz;
  color = srgbToLinear(vec3<f32>(
    curveSpline(srgb.r, ${params}, tangents),
    curveSpline(srgb.g, ${params}, tangents),
    curveSpline(srgb.b, ${params}, tangents),
  ));
}
`,
  }
}
