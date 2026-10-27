import { describe, expect } from 'vitest'
import { it } from '@effect/vitest'
import { Arbitrary, Effect, Schema } from 'effect'
import { createLayer, makeRegistry, CURVE_POINT_COUNT, CURVE_X_EPS } from '../layers'
import type { Layer } from '../layers'
import type { BodySource } from '../shaders'
import {
  renderExposure,
  renderContrast,
  renderShadows,
  renderHighlights,
  renderToneCurve,
  renderWhiteBalance,
  renderSaturation,
  renderColorMixer,
  renderGrain,
  renderVignette,
  renderChromaticAberration,
  renderClarity,
  renderLut,
} from '../shaders'
import { curvePointsOf, isCurveNeutral, moveCurvePoint, resetCurve } from './curve'

const registry = makeRegistry({
  chromaticAberration: renderChromaticAberration,
  clarity: renderClarity,
  colorMixer: renderColorMixer,
  contrast: renderContrast,
  exposure: renderExposure,
  grain: renderGrain,
  highlights: renderHighlights,
  lut: renderLut,
  saturation: renderSaturation,
  shadows: renderShadows,
  toneCurve: renderToneCurve,
  vignette: renderVignette,
  whiteBalance: renderWhiteBalance,
})

const curveLayer = () => Effect.runSync(createLayer('toneCurve', registry))

/** A point moved by the UI: the layer's fields after one moveCurvePoint call. */
const move = (layer: Layer, index: number, x: number, y: number) =>
  moveCurvePoint(layer, index, x, y)

describe('tone curve layer defaults', () => {
  it('a fresh layer is the identity curve (and reads back as neutral)', () => {
    const layer = curveLayer()
    expect(layer.type).toBe('toneCurve')
    expect(isCurveNeutral(layer)).toBe(true)
    const points = curvePointsOf(layer)
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.75 },
      { x: 1, y: 1 },
    ])
  })

  it.prop(
    'every point field sits in [0, 1]',
    {
      // Out-of-range drag targets: the invariants must hold whatever the path.
      values: Arbitrary.array(
        Arbitrary.schema(Schema.Finite.check(Schema.isBetween({ minimum: -2, maximum: 2 }))),
        { maxLength: 32, minLength: 0 },
      ),
    },
    ({ values }) => {
      let layer: Layer = curveLayer()
      for (let i = 0; i < values.length; i++) {
        layer = move(layer, i % CURVE_POINT_COUNT, values[i]!, values[(i + 1) % values.length] ?? 0)
      }
      for (const p of curvePointsOf(layer)) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(1)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(1)
      }
    },
  )
})

describe('moveCurvePoint', () => {
  it.prop(
    'keeps the points strictly x-ordered after any drag path',
    {
      moves: Arbitrary.array(
        Arbitrary.schema(
          Schema.Struct({
            index: Schema.Int.check(Schema.isBetween({ minimum: -8, maximum: 8 })),
            x: Schema.Finite.check(Schema.isBetween({ minimum: -2, maximum: 2 })),
            y: Schema.Finite.check(Schema.isBetween({ minimum: -2, maximum: 2 })),
          }),
        ),
        { maxLength: 32, minLength: 0 },
      ),
    },
    ({ moves }) => {
      // The spline evaluator walks the points in x order, so every drag — even
      // one that targets a neighbor's position — must leave them increasing.
      let layer: Layer = curveLayer()
      for (const point of moves) {
        layer = move(layer, point.index, point.x, point.y)
      }
      const xs = curvePointsOf(layer).map((point) => point.x)
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]!).toBeGreaterThan(xs[i - 1]!)
      }
    },
  )

  it('clamps y into [0, 1]', () => {
    const layer = move(curveLayer(), 2, 0.5, 3)
    expect(curvePointsOf(layer)[2]).toEqual({ x: 0.5, y: 1 })
    const down = move(curveLayer(), 2, 0.5, -3)
    expect(curvePointsOf(down)[2]).toEqual({ x: 0.5, y: 0 })
  })

  it('keeps points x-ordered: an interior point cannot cross its neighbors', () => {
    // Drag p1 far right: it must stop just left of p2 (0.5 - eps).
    const layer = move(curveLayer(), 1, 0.9, 0.5)
    const points = curvePointsOf(layer)
    expect(points[1]!.x).toBeCloseTo(0.5 - CURVE_X_EPS, 6)
    // Drag p1 far left: it must stop just right of p0 (0 + eps).
    const left = move(curveLayer(), 1, -1, 0.5)
    expect(curvePointsOf(left)[1]!.x).toBeCloseTo(CURVE_X_EPS, 6)
  })

  it('clamps the black anchor against its right neighbor and 0', () => {
    const layer = move(curveLayer(), 0, 0.4, 0.1)
    const points = curvePointsOf(layer)
    expect(points[0]!.x).toBeCloseTo(0.25 - CURVE_X_EPS, 6)
    expect(points[0]!.y).toBe(0.1)
  })

  it('clamps the white anchor against its left neighbor and 1', () => {
    const layer = move(curveLayer(), 4, 0.6, 0.9)
    const points = curvePointsOf(layer)
    expect(points[4]!.x).toBeCloseTo(0.75 + CURVE_X_EPS, 6)
    expect(points[4]!.y).toBe(0.9)
  })

  it('in-range moves pass through and flip the neutral flag', () => {
    const layer = move(curveLayer(), 2, 0.5, 0.7)
    expect(curvePointsOf(layer)[2]).toEqual({ x: 0.5, y: 0.7 })
    expect(isCurveNeutral(layer)).toBe(false)
  })

  it('rounds and clamps the point index', () => {
    // Fractional and out-of-range indices target the nearest valid point.
    // (Moving p3 to x = 0.5 collides with p2's 0.5, so the x clamp stops
    // it at 0.5 + eps.)
    expect(curvePointsOf(move(curveLayer(), 2.6, 0.5, 0.6))[3]).toEqual({
      x: 0.5 + CURVE_X_EPS,
      y: 0.6,
    })
    expect(curvePointsOf(move(curveLayer(), 99, 0.5, 0.6))[4]).toEqual({
      x: 0.75 + CURVE_X_EPS,
      y: 0.6,
    })
    expect(curvePointsOf(move(curveLayer(), -5, 0.1, 0.2))[0]).toEqual({ x: 0.1, y: 0.2 })
  })

  it('is a no-op for other layer types (the widget can never produce it, but a stray message must be safe)', () => {
    const exposure = Effect.runSync(createLayer('exposure', registry))
    expect(move(exposure, 2, 0.5, 0.6)).toBe(exposure)
  })
})

describe('resetCurve', () => {
  it('returns a moved curve to the identity and to neutral', () => {
    const moved = move(move(curveLayer(), 1, 0.3, 0.2), 3, 0.7, 0.9)
    expect(isCurveNeutral(moved)).toBe(false)
    const reset = resetCurve(moved)
    expect(isCurveNeutral(reset)).toBe(true)
    expect(curvePointsOf(reset)).toEqual([
      { x: 0, y: 0 },
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.75 },
      { x: 1, y: 1 },
    ])
    // The identity (layer type, id, visibility) survives the reset.
    expect(reset.id).toBe(moved.id)
    expect(reset.visible).toBe(true)
  })

  it('is a no-op for other layer types', () => {
    const exposure = Effect.runSync(createLayer('exposure', registry))
    expect(resetCurve(exposure)).toBe(exposure)
  })
})

describe('curve body renderer', () => {
  const bodySourceOf = (source: string | BodySource): BodySource =>
    Schema.is(Schema.String)(source) ? { stmts: source } : source

  it('derives the Fritsch–Carlson tangents on the CPU', () => {
    const tangentsOf = (ys: readonly number[]) => {
      const xs = [0, 0.25, 0.5, 0.75, 1]
      const derived = bodySourceOf(renderToneCurve(0)).derived!
      const fields: Record<string, number> = {}
      xs.forEach((x, n) => {
        fields[`p${n}x`] = x
        fields[`p${n}y`] = ys[n]!
      })
      return [...derived.compute((key) => fields[key]!)].slice(0, 3)
    }
    const close = (actual: number[], expected: number[]) =>
      actual.forEach((v, k) => expect(v).toBeCloseTo(expected[k]!, 5))
    // Identity: every secant slope is 1.
    close(tangentsOf([0, 0.25, 0.5, 0.75, 1]), [1, 1, 1])
    // S-curve: secants 0.4, 1.6, 1.6, 0.4 → harmonic means 0.64, 1.6, 0.64.
    close(tangentsOf([0, 0.1, 0.5, 0.9, 1]), [0.64, 1.6, 0.64])
    // A secant sign change flattens the tangent at that point.
    close(tangentsOf([0, 0.5, 0.2, 0.6, 1]), [0, 0, 1.6])
  })

  it('evaluates the spline per channel with the derived tangents', () => {
    const source = bodySourceOf(renderToneCurve(0))
    expect(source.stmts).toContain('let tangents = u_params.l0_derived[0].xyz;')
    for (const channel of ['r', 'g', 'b']) {
      expect(source.stmts).toContain(`curveSpline(srgb.${channel},`)
    }
  })

  it('a second layer at index 2 namespaces its uniforms with l2_', () => {
    const source = bodySourceOf(renderToneCurve(2))
    const stmts = source.stmts
    expect(stmts).toContain('l2_p0x')
    expect(stmts).not.toContain('l0_p0x')
  })
})
