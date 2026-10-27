import { describe, expect } from 'vitest'
import { it } from '@effect/vitest'
import { Arbitrary, Effect, Schema } from 'effect'
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

import { numField, strField } from './layers/fields'

const isMissingLut = (layer: Layer, luts: ReadonlyMap<LutId, LutCube>): boolean => {
  const id = strField(layer, FieldKey('lutId'))
  return id === '' || !luts.has(LutId(id))
}

const lutIdOf = (layer: Layer): string => strField(layer, FieldKey('lutId'))

const hasUnknownVisibleLut = (
  chain: readonly Layer[],
  luts: ReadonlyMap<LutId, LutCube>,
): boolean => chain.some((l) => l.visible && l.type === 'lut' && isMissingLut(l, luts))

// Property tests derive their inputs from Effect Schemas and generate through
// Effect's `Arbitrary` (docs/adr/0012-property-testing).

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

/** The LUT ids a scene may reference. */
const LUT_IDS = [
  'luts/colorslide/fuji_velvia_50.cube',
  'luts/print/kodak_2393_cuspclip.cube',
  'luts/bw/agfa_apx_100.cube',
] as const

const cubeOfSize = (size: number): LutCube => ({
  data: new Float32Array(size ** 3 * 3),
  size,
})

/** A scene spec: the shape of a chain before the layers are built. */
const sceneSpecArb = Arbitrary.all({
  types: Arbitrary.array(Arbitrary.schema(Schema.Literals(LAYER_TYPES)), {
    maxLength: 8,
    minLength: 0,
  }),
  visibility: Arbitrary.array(Arbitrary.schema(Schema.Boolean), { maxLength: 8, minLength: 0 }),
  values: Arbitrary.array(
    Arbitrary.schema(Schema.Finite.check(Schema.isBetween({ minimum: -3, maximum: 3 }))),
    { maxLength: 64, minLength: 0 },
  ),
  present: Arbitrary.array(Arbitrary.schema(Schema.Boolean), { maxLength: 8, minLength: 0 }),
  lutIds: Arbitrary.array(Arbitrary.schema(Schema.Literals(LUT_IDS)), {
    maxLength: 8,
    minLength: 1,
  }),
  cubeSize: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 16 }))),
})

/** Build the chain the spec describes, carrying every field value through. */
const buildScene = (spec: {
  readonly types: ReadonlyArray<LayerType>
  readonly visibility: ReadonlyArray<boolean>
  readonly values: ReadonlyArray<number>
  readonly present: ReadonlyArray<boolean>
  readonly lutIds: ReadonlyArray<string>
  readonly cubeSize: number
}) => {
  const chain: Layer[] = []
  let valueIdx = 0
  const usedLutIds: string[] = []
  for (let i = 0; i < spec.types.length; i++) {
    const layer = Effect.runSync(createLayer(spec.types[i]!, registry))
    const record: Record<string, number | string | boolean> = layer
    record.visible = spec.visibility[i] ?? true
    for (const key of fieldKeysOf(spec.types[i]!)) {
      record[key] = spec.values[valueIdx++] ?? 0
    }
    if (spec.types[i] === 'lut') {
      const id = spec.lutIds[i % spec.lutIds.length]!
      usedLutIds.push(id)
      record.lutId = id
    }
    chain.push(layer)
  }
  const luts = new Map<LutId, LutCube>()
  for (const id of usedLutIds) {
    if (spec.present[usedLutIds.indexOf(id)] ?? false) {
      luts.set(LutId(id), cubeOfSize(spec.cubeSize))
    }
  }
  return { chain, cubeSize: spec.cubeSize, luts }
}

/** Any scene whose every referenced LUT resolves. */
const resolvableSceneArb = Arbitrary.map(sceneSpecArb, (spec) => {
  const scene = buildScene(spec)
  const luts = new Map(scene.luts)
  for (const layer of scene.chain) {
    if (layer.type === 'lut') {
      luts.set(LutId(lutIdOf(layer)), cubeOfSize(scene.cubeSize))
    }
  }
  return { chain: scene.chain, cubeSize: scene.cubeSize, luts }
})

/** Any scene, with a visible LUT layer appended that points at a missing id. */
const unknownLutSceneArb = Arbitrary.map(sceneSpecArb, (spec) => {
  const scene = buildScene(spec)
  const unknownId = LUT_IDS[0]
  const layer = Effect.runSync(createLayer('lut', registry))
  const record: Record<string, number | string | boolean> = layer
  record.visible = true
  record.lutId = unknownId
  const luts = new Map(scene.luts)
  luts.delete(LutId(unknownId))
  return { chain: [...scene.chain, layer], cubeSize: scene.cubeSize, luts }
})

describe('createRenderRequest', () => {
  it.prop(
    'resolves any chain into passes, uniforms, and luts coherently',
    {
      scene: resolvableSceneArb,
    },
    ({ scene: { chain, luts } }) => {
      const frame = 7
      const bitmap = fakeBitmap()
      const result = Effect.runSync(createRenderRequest(chain, registry, bitmap, frame, luts))
      const visible = chain.filter((l) => l.visible)

      // Per-pixel layers fuse; a sampling layer starts a new pass unless it
      // heads the chain. An empty chain still assembles one copy pass.
      const samples = (layer: Layer) => {
        const body = registry[layer.type].body(0)
        return !Schema.is(Schema.String)(body) && body.samplesInput === true
      }
      const runs: number[][] = [[]]
      visible.forEach((layer, li) => {
        if (samples(layer) && runs.at(-1)!.length > 0) {
          runs.push([li])
        } else {
          runs.at(-1)!.push(li)
        }
      })

      // The bitmap and frame counter pass through untouched.
      expect(result.srcBitmap).toBe(bitmap)
      expect(result.frame).toBe(frame)
      expect(result.luts).toBe(luts)
      expect(result.pixelScale).toBe(1)

      expect(result.shader.passes).toHaveLength(runs.length)

      // The LUT layers resolved through the map, in chain order.
      const lutIdsInOrder = visible.filter((l) => l.type === 'lut').map(lutIdOf)
      expect(result.shader.passes.flatMap((p) => p.lutIds)).toEqual(lutIdsInOrder)

      result.shader.passes.forEach((pass, pi) => {
        const packed = result.uniforms[pi]!
        expect(packed).toHaveLength(pass.uniformLength)
        // Each layer of the run exposes one slot per field, in field order,
        // and the packed buffer holds the layer's value at that slot.
        expect(pass.uniforms.map((slot) => [slot.layerIndex, slot.field])).toEqual(
          runs[pi]!.flatMap((li) => fieldKeysOf(visible[li]!.type).map((key) => [li, key])),
        )
        for (const slot of pass.uniforms) {
          // The uniform buffer is f32: values round to float32 precision.
          expect(packed[slot.offset]).toBeCloseTo(
            numField(visible[slot.layerIndex]!, slot.field),
            5,
          )
        }
        // Scalar slots and vec4-aligned derived tables never overlap.
        const used = new Set<number>()
        const claim = (offset: number) => {
          expect(offset).toBeLessThan(pass.uniformLength)
          expect(used.has(offset)).toBe(false)
          used.add(offset)
        }
        for (const slot of pass.uniforms) claim(slot.offset)
        for (const slot of pass.derived) {
          expect(slot.offset % 4).toBe(0)
          for (let k = 0; k < slot.length * 4; k++) claim(slot.offset + k)
        }
      })
    },
  )

  it.prop(
    'fails with GpuError when any visible LUT layer references an unknown id',
    {
      scene: unknownLutSceneArb,
    },
    ({ scene: { chain, luts } }) => {
      // The generated scene ends with a visible LUT layer whose id the map
      // does not hold — the GpuError domain by construction, no precondition.
      expect(hasUnknownVisibleLut(chain, luts)).toBe(true)

      const message = Effect.runSync(
        Effect.match(createRenderRequest(chain, registry, fakeBitmap(), 0, luts), {
          onFailure: (error) => error.message,
          onSuccess: () => {
            throw new Error('expected a GpuError for an unknown LUT id')
          },
        }),
      )
      expect(message).toContain('Unknown LUT:')
    },
  )

  it('reuses the shader for an unchanged chain shape and recomputes derived tables on change', () => {
    const curve = (p1y: number): Layer => {
      const layer = Effect.runSync(createLayer('toneCurve', registry))
      const record: Record<string, number | string | boolean> = layer
      record.p1y = p1y
      return layer
    }
    const request = (chain: readonly Layer[]) =>
      Effect.runSync(createRenderRequest(chain, registry, fakeBitmap(), 0, new Map()))
    const tangents = (r: ReturnType<typeof request>) => {
      const slot = r.shader.passes[0]!.derived[0]!
      return [...r.uniforms[0]!.slice(slot.offset, slot.offset + 3)]
    }
    const identity = request([curve(0.25)])
    const lifted = request([curve(0.4)])
    // Same shape: the assembled shader is reused, not rebuilt.
    expect(lifted.shader).toBe(identity.shader)
    // The tangents follow the field values, in both directions.
    tangents(identity).forEach((t) => expect(t).toBeCloseTo(1, 5))
    expect(tangents(lifted)).not.toEqual(tangents(identity))
    expect(tangents(request([curve(0.25)]))).toEqual(tangents(identity))
    // A new shape assembles a new shader.
    expect(request([curve(0.25), curve(0.25)]).shader).not.toBe(identity.shader)
  })

  it.prop(
    'an empty chain assembles a single passthrough pass',
    {
      frame: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    },
    ({ frame }) => {
      const request = Effect.runSync(
        createRenderRequest([], registry, fakeBitmap(), frame, new Map<LutId, LutCube>()),
      )
      expect(request.shader.passes).toHaveLength(1)
      expect(request.shader.passes[0]!.uniforms).toEqual([])
      expect(request.uniforms).toHaveLength(1)
      expect(request.uniforms[0]).toEqual(new Float32Array(0))
      expect(request.shader.passes[0]!.lutIds).toEqual([])
    },
  )
})
