import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { Effect, Schema } from 'effect'
import { createRenderRequest } from './render'
import { createLayer, makeRegistry, LAYER_TYPES } from './layers'
import type { Layer, LayerType } from './layers'
import { FieldKey, LutId } from './brands'
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
} from './shaders'
import type { LutCube } from './luts/cube'

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

// createRenderRequest never touches the bitmap (the GPU backend does); the
// test env has no ImageBitmap constructor, so a structural stand-in is fine.
class FakeBitmap implements ImageBitmap {
  readonly width = 0
  readonly height = 0
  close(): void {}
}

const fakeBitmap = (): ImageBitmap => new FakeBitmap()

const fieldKeysOf = (type: LayerType) => Object.keys(registry[type].fields)

const lutIdArb = fc.constantFrom(
  'luts/colorslide/fuji_velvia_50.cube',
  'luts/print/kodak_2393_cuspclip.cube',
  'luts/bw/agfa_apx_100.cube',
)

const cubeOfSize = (size: number): LutCube => ({
  data: new Float32Array(size * size * size * 3),
  size,
})

/**
 * A random scene: an arbitrary chain (random types, visibility, param
 * values, LUT ids from a pool) and a LUT map holding a random subset of
 * the referenced ids.
 */
const sceneArb = fc
  .tuple(
    fc.array(fc.constantFrom(...LAYER_TYPES), { maxLength: 8, minLength: 0 }),
    fc.array(fc.boolean(), { maxLength: 8, minLength: 0 }),
    fc.array(fc.double({ max: 3, min: -3, noDefaultInfinity: true, noNaN: true }), {
      maxLength: 64,
      minLength: 0,
    }),
    fc.array(fc.boolean(), { maxLength: 8, minLength: 0 }),
    fc.array(lutIdArb, { maxLength: 8, minLength: 1 }),
    fc.integer({ max: 16, min: 2 }),
  )
  .map(([types, visibility, values, present, lutIds, cubeSize]) => {
    const chain: Layer[] = []
    let valueIdx = 0
    const usedLutIds: string[] = []
    for (let i = 0; i < types.length; i++) {
      const layer = Effect.runSync(createLayer(types[i]!, registry))
      const record: Record<string, number | string | boolean> = layer
      record.visible = visibility[i] ?? true
      for (const key of fieldKeysOf(types[i]!)) {
        record[key] = values[valueIdx++] ?? 0
      }
      if (types[i] === 'lut') {
        const id = lutIds[i % lutIds.length]!
        usedLutIds.push(id)
        record.lutId = id
      }
      chain.push(layer)
    }
    const luts = new Map<LutId, LutCube>()
    for (const id of usedLutIds) {
      if (present[usedLutIds.indexOf(id)] ?? false) {
        luts.set(LutId(id), cubeOfSize(cubeSize))
      }
    }
    return { chain, cubeSize, luts }
  })

import { numField, strField } from './layers/fields'

/** A layer's numeric field values, in the registry's key order. */
const fieldValues = (layer: Layer): readonly number[] =>
  fieldKeysOf(layer.type).map((k) => numField(layer, FieldKey(k)))

const isMissingLut = (layer: Layer, luts: ReadonlyMap<LutId, LutCube>): boolean => {
  const id = strField(layer, FieldKey('lutId'))
  return id === '' || !luts.has(LutId(id))
}

const lutIdOf = (layer: Layer): string => strField(layer, FieldKey('lutId'))

const hasUnknownVisibleLut = (
  chain: readonly Layer[],
  luts: ReadonlyMap<LutId, LutCube>,
): boolean => chain.some((l) => l.visible && l.type === 'lut' && isMissingLut(l, luts))

describe('createRenderRequest', () => {
  it('resolves any chain into passes, uniforms, and luts coherently', () => {
    fc.assert(
      fc.property(sceneArb, ({ chain, luts, cubeSize }) => {
        // Scenes with an unresolvable LUT id are the GpuError domain.
        fc.pre(!hasUnknownVisibleLut(chain, luts))
        const frame = 7
        const bitmap = fakeBitmap()
        const result = Effect.runSync(createRenderRequest(chain, registry, bitmap, frame, luts))
        const visible = chain.filter((l) => l.visible)

        // Sampling first bodies get a leading linearize pass; an empty
        // chain still assembles a single passthrough pass.
        const firstSamples =
          visible.length > 0 &&
          (() => {
            const body = registry[visible[0]!.type].body(0)
            return !Schema.is(Schema.String)(body) && body.samplesInput === true
          })()
        const base = firstSamples ? 1 : 0

        // The bitmap and frame counter pass through untouched.
        expect(result.srcBitmap).toBe(bitmap)
        expect(result.frame).toBe(frame)
        expect(result.luts).toBe(luts)

        // One pass per visible layer, plus the leading linearize pass.
        expect(result.shader.passes).toHaveLength(Math.max(1, visible.length) + base)
        if (firstSamples) {
          expect(result.shader.passes[0]!.uniforms).toEqual([])
          expect(result.shader.passes[0]!.lutId).toBeUndefined()
        }

        // The LUT layers resolved through the map, in chain order.
        const lutIdsInOrder = visible.filter((l) => l.type === 'lut').map(lutIdOf)
        const passLutIds = result.shader.passes
          .map((p) => p.lutId)
          .filter((id): id is LutId => id !== undefined)
        expect(passLutIds).toEqual(lutIdsInOrder)

        for (let li = 0; li < visible.length; li++) {
          const layer = visible[li]!
          const pass = result.shader.passes[base + li]!
          const keys = fieldKeysOf(layer.type)
          // Each pass exposes one uniform slot per field, in order.
          expect(pass.uniforms).toEqual(
            keys.map((key, offset) => ({ field: FieldKey(key), layerIndex: li, offset })),
          )
          // The packed uniform buffer matches the layer's field values.
          const packed = result.uniforms[base + li]!
          const values = fieldValues(layer)
          expect(packed).toHaveLength(keys.length)
          for (let s = 0; s < keys.length; s++) {
            // The uniform buffer is f32: values round to float32 precision.
            expect(packed[s]).toBeCloseTo(values[s]!, 6)
          }
          if (layer.type === 'lut') {
            const lutId = lutIdOf(layer)
            expect(pass.lutId).toBe(lutId)
            expect(pass.source).toContain(`const LUT_SIZE: f32 = ${cubeSize}.0;`)
          }
        }
      }),
    )
  })

  it('fails with GpuError when any visible LUT layer references an unknown id', () => {
    fc.assert(
      fc.property(sceneArb, ({ chain, luts }) => {
        fc.pre(hasUnknownVisibleLut(chain, luts))

        const message = Effect.runSync(
          Effect.match(createRenderRequest(chain, registry, fakeBitmap(), 0, luts), {
            onFailure: (error) => error.message,
            onSuccess: () => {
              throw new Error('expected a GpuError for an unknown LUT id')
            },
          }),
        )
        expect(message).toContain('Unknown LUT:')
      }),
    )
  })

  it('an empty chain assembles a single passthrough pass', () => {
    fc.assert(
      fc.property(
        fc.record({ frame: fc.nat(), luts: fc.constant(new Map<LutId, LutCube>()) }),
        ({ luts, frame }) => {
          const request = Effect.runSync(
            createRenderRequest([], registry, fakeBitmap(), frame, luts),
          )
          expect(request.shader.passes).toHaveLength(1)
          expect(request.shader.passes[0]!.uniforms).toEqual([])
          expect(request.uniforms).toHaveLength(1)
          expect(request.uniforms[0]).toEqual(new Float32Array(0))
          expect(request.shader.passes[0]!.lutId).toBeUndefined()
        },
      ),
    )
  })
})
