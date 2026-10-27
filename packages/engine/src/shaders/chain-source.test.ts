import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import {
  generateChainSource as generateChainSourceEffect,
  LUT_BINDING_BASE,
  WORKGROUP_SIZE,
} from '../shaders/chain-source'
import type { ChainLayerInfo } from '../shaders/chain-source'
import { FieldKey, LutId } from '../brands'
import { renderExposure } from '../shaders/bodies/exposure'
import { renderSaturation } from '../shaders/bodies/saturation'
import { renderChromaticAberration } from '../shaders/bodies/chromatic-aberration'
import { renderGrain } from '../shaders/bodies/grain'
import { renderClarity } from '../shaders/bodies/clarity'
import { renderLut } from '../shaders/bodies/lut'
import { renderToneCurve } from '../shaders/bodies/tone-curve'

/** A 13³ LUT layer as the assembler receives it from the render request. */
const lutLayer = (over: Partial<ChainLayerInfo> = {}): ChainLayerInfo => ({
  body: renderLut,
  fieldKeys: [FieldKey('amount')],
  lutId: LutId('luts/colorslide/fuji_velvia_50.cube'),
  type: 'lut',
  ...over,
})

const generateChainSource = (layers: readonly ChainLayerInfo[]) =>
  Effect.runSync(generateChainSourceEffect(layers))

const exposure: ChainLayerInfo = {
  body: renderExposure,
  fieldKeys: [FieldKey('stops')],
  type: 'exposure',
}
const saturation: ChainLayerInfo = {
  body: renderSaturation,
  fieldKeys: [FieldKey('amount')],
  type: 'saturation',
}
const clarity: ChainLayerInfo = {
  body: renderClarity,
  fieldKeys: [FieldKey('amount')],
  type: 'clarity',
}
const aberration: ChainLayerInfo = {
  body: renderChromaticAberration,
  fieldKeys: [FieldKey('amount')],
  type: 'chromaticAberration',
}
const grain: ChainLayerInfo = {
  body: renderGrain,
  fieldKeys: [FieldKey('amount'), FieldKey('profile'), FieldKey('size'), FieldKey('chroma')],
  type: 'grain',
}
const toneCurve: ChainLayerInfo = {
  body: renderToneCurve,
  fieldKeys: [0, 1, 2, 3, 4].flatMap((n) => [FieldKey(`p${n}x`), FieldKey(`p${n}y`)]),
  type: 'toneCurve',
}

/** The chain indices of the layers each pass runs. */
const passLayers = (layers: readonly ChainLayerInfo[]) =>
  generateChainSource(layers).passes.map((pass) => [
    ...new Set([...pass.uniforms, ...pass.derived].map((slot) => slot.layerIndex)),
  ])

const count = (source: string, needle: string) => source.split(needle).length - 1

const ENCODE = 'linearToSrgb(clamp(color'
const DECODE = 'srgbToLinear(color)'

describe('generateChainSource', () => {
  it('emits one copy pass that writes the display texture for an empty chain', () => {
    const { passes } = generateChainSource([])
    expect(passes).toHaveLength(1)
    const pass = passes[0]!
    expect(pass.source).toContain(`@workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})`)
    expect(pass.source).toContain('texture_storage_2d<rgba8unorm, write>')
    expect(pass.uniformLength).toBe(0)
    expect(pass.source).not.toContain('u_params')
  })

  it('fuses per-pixel layers and starts a pass at each sampling layer', () => {
    // A sampling layer must read the accumulated result of every earlier
    // layer, so it starts a pass; per-pixel layers after it join that pass.
    expect(passLayers([exposure, saturation, grain])).toEqual([[0, 1, 2]])
    expect(passLayers([exposure, clarity, saturation])).toEqual([[0], [1, 2]])
    expect(passLayers([exposure, clarity, aberration, grain])).toEqual([[0], [1], [2, 3]])
    // A sampling layer at the head reads the source directly: no extra pass.
    expect(passLayers([clarity, exposure])).toEqual([[0, 1]])
    expect(passLayers([lutLayer(), clarity, lutLayer()])).toEqual([[0], [1, 2]])
  })

  it('writes linear intermediates and only the last pass encodes and bins the histogram', () => {
    const { passes } = generateChainSource([exposure, clarity, saturation])
    expect(passes[0]!.source).toContain('texture_storage_2d<rgba16float, write>')
    expect(passes[0]!.source).not.toContain(ENCODE)
    expect(passes[0]!.source).not.toContain('var<storage, read_write> bins')
    expect(passes[1]!.source).toContain('texture_storage_2d<rgba8unorm, write>')
    expect(passes[1]!.source).toContain(`let outColor = ${ENCODE}`)
    expect(passes[1]!.source).toContain('@group(0) @binding(6) var<storage, read_write> bins')
    // No pass decodes its input: the source view and intermediates are linear.
    for (const pass of passes) {
      expect(pass.source).toContain('var color = src.rgb;')
    }
  })

  it('names uniforms by position in the pass, so a pass compiles the same anywhere in the chain', () => {
    const alone = generateChainSource([clarity, exposure]).passes[0]!
    const shifted = generateChainSource([saturation, saturation, clarity, exposure]).passes[1]!
    expect(shifted.source).toBe(alone.source)
    // The slots still point at the layers' chain indices for packing.
    expect(shifted.uniforms).toEqual([
      { field: 'amount', layerIndex: 2, offset: 0 },
      { field: 'stops', layerIndex: 3, offset: 1 },
    ])
    expect(alone.source).toContain('l1_stops: f32,')
  })

  it('places derived tables at vec4-aligned offsets after the layer scalars', () => {
    const { passes } = generateChainSource([exposure, toneCurve])
    const pass = passes[0]!
    // exposure: slot 0; tone curve: slots 1..10; tangents table at 12.
    expect(pass.uniforms.at(-1)).toEqual({ field: 'p4y', layerIndex: 1, offset: 10 })
    expect(pass.derived).toEqual([
      expect.objectContaining({ layerIndex: 1, length: 1, offset: 12 }),
    ])
    expect(pass.uniformLength).toBe(16)
    expect(pass.source).toContain('l1_derived: array<vec4<f32>, 1>,')
  })

  it('emits shared helpers once when a pass repeats a layer type', () => {
    const { passes } = generateChainSource([toneCurve, toneCurve, grain, grain])
    expect(passes).toHaveLength(1)
    expect(count(passes[0]!.source, 'fn curveSpline(')).toBe(1)
    expect(count(passes[0]!.source, 'fn grainNoise(')).toBe(1)
  })

  it('encodes to sRGB around LUT bodies only where the encoding changes', () => {
    // Lone LUT: encode for the body, and the output is already sRGB.
    const lone = generateChainSource([lutLayer()]).passes[0]!
    expect(count(lone.source, ENCODE)).toBe(1)
    expect(lone.source).not.toContain(DECODE)
    // Adjacent LUTs share one encode; the following layer decodes once.
    const pair = generateChainSource([
      lutLayer(),
      lutLayer({ lutId: LutId('luts/print/kodak_2393_cuspclip.cube') }),
      exposure,
    ]).passes[0]!
    expect(count(pair.source, ENCODE)).toBe(2)
    expect(count(pair.source, DECODE)).toBe(1)
    // A LUT at the end of an intermediate pass decodes back to linear.
    const middle = generateChainSource([exposure, lutLayer(), clarity]).passes[0]!
    expect(middle.source).toContain(`let outColor = srgbToLinear(color);`)
  })

  it('binds each LUT of a pass at its own binding, in chain order', () => {
    const second = LutId('luts/print/kodak_2393_cuspclip.cube')
    const { passes } = generateChainSource([lutLayer(), exposure, lutLayer({ lutId: second })])
    const pass = passes[0]!
    expect(pass.lutIds).toEqual(['luts/colorslide/fuji_velvia_50.cube', second])
    expect(pass.usesSampler).toBe(true)
    expect(pass.source).toContain(
      `@group(0) @binding(${LUT_BINDING_BASE}) var l0_lut: texture_3d<f32>;`,
    )
    expect(pass.source).toContain(
      `@group(0) @binding(${LUT_BINDING_BASE + 1}) var l2_lut: texture_3d<f32>;`,
    )
  })

  it('fails on the Effect error channel when a LUT body has no cube reference', () => {
    const layers: ChainLayerInfo[] = [
      { body: renderLut, fieldKeys: [FieldKey('amount')], type: 'lut' },
    ]
    const result = Effect.runSync(
      Effect.match(generateChainSourceEffect(layers), {
        onFailure: (error) => ({ _tag: 'failure' as const, error }),
        onSuccess: () => ({ _tag: 'success' as const }),
      }),
    )
    expect(result._tag).toBe('failure')
    if (result._tag === 'failure') {
      expect(result.error.message).toMatch(/missing its cube reference/)
    }
  })

  it('binds every scalar uniform reference used by a body to u_params', () => {
    // WGSL struct members are only in scope through the struct variable, so
    // each `l{i}_{field}` reference a body makes must be bound to
    // `u_params.<field>` before the bodies are inlined; otherwise the
    // shader fails to compile in the browser.
    const { passes } = generateChainSource([
      exposure,
      toneCurve,
      lutLayer(),
      saturation,
      clarity,
      aberration,
      grain,
    ])
    for (const pass of passes) {
      const tokens = new Set(pass.source.match(/\bl\d+_\w+/g) ?? [])
      for (const token of tokens) {
        if (token.endsWith('_derived') || token.endsWith('_lut')) continue
        expect(pass.source).toContain(`let ${token} = u_params.${token};`)
      }
    }
  })
})
