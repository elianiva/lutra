import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import * as fc from 'fast-check'
import { FieldKey } from '../brands'
import { numField, strField } from './fields'
import { createLayer } from './defaults'
import { makeRegistry } from './registry'
import { LAYER_TYPES } from './schemas'
import type { LayerType } from './schemas'
import {
  renderChromaticAberration,
  renderClarity,
  renderColorMixer,
  renderContrast,
  renderExposure,
  renderGrain,
  renderHighlights,
  renderLut,
  renderSaturation,
  renderShadows,
  renderToneCurve,
  renderVignette,
  renderWhiteBalance,
} from '../shaders'

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

/**
 * The documented per-type defaults — a product contract pinned
 * independently of the registry (a default drifting in the registry
 * fails the differential check).
 */
const DEFAULTS = {
  exposure: { stops: 0 },
  contrast: { amount: 0 },
  shadows: { amount: 0 },
  highlights: { amount: 0 },
  // The Tone Curve's 5 identity points (docs/adr/0028): the diagonal.
  toneCurve: {
    p0x: 0,
    p0y: 0,
    p1x: 0.25,
    p1y: 0.25,
    p2x: 0.5,
    p2y: 0.5,
    p3x: 0.75,
    p3y: 0.75,
    p4x: 1,
    p4y: 1,
  },
  whiteBalance: { temp: 0, tint: 0 },
  saturation: { amount: 0 },
  // The Color Mixer: 24 fields, all zeroed (identity).
  colorMixer: {
    aquaHue: 0,
    aquaLuminance: 0,
    aquaSaturation: 0,
    blueHue: 0,
    blueLuminance: 0,
    blueSaturation: 0,
    greenHue: 0,
    greenLuminance: 0,
    greenSaturation: 0,
    magentaHue: 0,
    magentaLuminance: 0,
    magentaSaturation: 0,
    orangeHue: 0,
    orangeLuminance: 0,
    orangeSaturation: 0,
    purpleHue: 0,
    purpleLuminance: 0,
    purpleSaturation: 0,
    redHue: 0,
    redLuminance: 0,
    redSaturation: 0,
    yellowHue: 0,
    yellowLuminance: 0,
    yellowSaturation: 0,
  },
  grain: { amount: 0, chroma: 0.2, profile: 1, size: 0 },
  vignette: { amount: 0, size: 0.6 },
  chromaticAberration: { amount: 0 },
  clarity: { amount: 0 },
  lut: { amount: 1 },
} satisfies Record<LayerType, Record<string, number>>

const typeArb = fc.constantFrom(...LAYER_TYPES)

describe('createLayer', () => {
  it('creates every layer type with the documented defaults', () => {
    fc.assert(
      fc.property(typeArb, (type) => {
        const layer = Effect.runSync(createLayer(type, registry))
        expect(layer.type).toBe(type)
        expect(layer.visible).toBe(true)
        for (const [key, expected] of Object.entries(DEFAULTS[type])) {
          expect(numField(layer, FieldKey(key))).toBe(expected)
        }
        // String-typed fields get their registry defaults (LUT id empty).
        for (const [key, expected] of Object.entries(registry[type].stringFields ?? {})) {
          expect(strField(layer, FieldKey(key))).toBe(expected)
        }
      }),
    )
  })

  it('assigns a unique id to every layer in any sequence of creates', () => {
    fc.assert(
      fc.property(fc.array(typeArb, { maxLength: 20, minLength: 2 }), (types) => {
        const ids = types.map((type) => Effect.runSync(createLayer(type, registry)).id)
        expect(new Set(ids).size).toBe(ids.length)
      }),
    )
  })

  it('fails on the Effect error channel for any unknown type', () => {
    // The registry is a closed union; the test needs a deliberately-typed
    // escape hatch to feed a string the registry cannot contain.
    const layerTypeNames: readonly string[] = LAYER_TYPES
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((type) => !layerTypeNames.includes(type)),
        (type) => {
          // SAFETY: the fast-check filter proved the string is not a LayerType name, so createLayer must reject it.
          // oxlint-disable-next-line consistent-type-assertions
          const type_ = type as LayerType
          const result = Effect.runSync(
            Effect.match(createLayer(type_, registry), {
              onFailure: (error) => ({ _tag: 'failure' as const, error }),
              onSuccess: () => ({ _tag: 'success' as const }),
            }),
          )
          expect(result._tag).toBe('failure')
          if (result._tag === 'failure') {
            expect(result.error).toMatchObject({ _tag: 'UnknownLayerTypeError' })
          }
        },
      ),
    )
  })
})
