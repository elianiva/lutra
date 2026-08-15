import { FieldKey } from '../brands'
import type { Layer } from './schemas'

// Tone curve helpers (docs/adr/0028): the Tone Curve layer is a fixed set
// of 5 control points — the black and white anchors plus three interior
// points — each with an x (input tone) and y (output tone) in [0, 1]. The
// shader maps every input tone through the piecewise-linear curve the
// points define, so the points are the layer: these pure helpers read,
// move, and reset them, and the UI (the drawer's curve widget) is the only
// caller.

/** The fixed number of control points (anchors + interior). */
export const CURVE_POINT_COUNT = 5

/** Minimum x separation between adjacent points, in tone units. Keeps the
 *  curve a function (x strictly increasing) and the handles grabbable —
 *  without it, two points can stack onto the same x and become
 *  indistinguishable. */
export const CURVE_X_EPS = 0.02

/**
 * The identity curve: every input tone passes through unchanged. These
 * positions are the layer's defaults, the widget's reset target, and the
 * reference `isCurveNeutral` compares against.
 */
export const CURVE_DEFAULT_POINTS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 0, y: 0 },
  { x: 0.25, y: 0.25 },
  { x: 0.5, y: 0.5 },
  { x: 0.75, y: 0.75 },
  { x: 1, y: 1 },
]

export interface CurvePoint {
  readonly x: number
  readonly y: number
}

/** The field key of a point's x (input tone): `p{i}x` (e.g. "p2x"). */
export const curvePointXField = (index: number): FieldKey => FieldKey(`p${index}x`)

/** The field key of a point's y (output tone): `p{i}y` (e.g. "p2y"). */
export const curvePointYField = (index: number): FieldKey => FieldKey(`p${index}y`)

/** Read a numeric field off a layer; NaN when absent or non-numeric. */
const num = (layer: Layer, key: FieldKey): number => {
  const record: Record<string, unknown> = layer
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN
}

/**
 * The layer's control points in index order. Values outside [0, 1] (a
 * hand-edited save) pass through as-is — the shader clamps its evaluation
 * domain and the widget clamps its drags, so rendering a slightly-out
 * point is safe; only non-finite values fall back to the identity
 * positions.
 */
export const curvePointsOf = (layer: Layer): ReadonlyArray<CurvePoint> =>
  Array.from({ length: CURVE_POINT_COUNT }, (_, i) => {
    const x = num(layer, curvePointXField(i))
    const y = num(layer, curvePointYField(i))
    const fallback = CURVE_DEFAULT_POINTS[i]!
    return {
      x: Number.isFinite(x) ? x : fallback.x,
      y: Number.isFinite(y) ? y : fallback.y,
    }
  })

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Move one control point to (x, y), clamped into the curve's invariants:
 * x stays strictly between its neighbors' x's (the endpoints against the
 * [0, 1] domain) so the points remain x-ordered and the curve stays a
 * function; y stays in [0, 1]. The index is rounded and clamped into
 * 0..CURVE_POINT_COUNT - 1. Non-toneCurve layers pass through untouched.
 */
export const moveCurvePoint = (layer: Layer, index: number, x: number, y: number): Layer => {
  if (layer.type !== 'toneCurve') return layer
  const i = Math.min(CURVE_POINT_COUNT - 1, Math.max(0, Math.round(index)))
  const points = curvePointsOf(layer)
  const xLo = i === 0 ? 0 : points[i - 1]!.x + CURVE_X_EPS
  const xHi = i === CURVE_POINT_COUNT - 1 ? 1 : points[i + 1]!.x - CURVE_X_EPS
  return {
    ...layer,
    [curvePointXField(i)]: clamp(x, xLo, xHi),
    [curvePointYField(i)]: clamp(y, 0, 1),
  }
}

/**
 * Reset every point to the identity curve (the layer's default positions).
 * Non-toneCurve layers pass through untouched.
 */
export const resetCurve = (layer: Layer): Layer => {
  if (layer.type !== 'toneCurve') return layer
  const fields: Record<string, number> = {}
  for (let i = 0; i < CURVE_POINT_COUNT; i++) {
    const point = CURVE_DEFAULT_POINTS[i]!
    fields[`p${i}x`] = point.x
    fields[`p${i}y`] = point.y
  }
  return { ...layer, ...fields }
}

/** Whether every point sits at its identity position (the curve is a no-op). */
export const isCurveNeutral = (layer: Layer): boolean => {
  if (layer.type !== 'toneCurve') return true
  return CURVE_DEFAULT_POINTS.every(
    (point, i) =>
      num(layer, curvePointXField(i)) === point.x && num(layer, curvePointYField(i)) === point.y,
  )
}
