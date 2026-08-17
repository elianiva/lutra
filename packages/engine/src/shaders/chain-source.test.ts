import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import {
  generateChainSource as generateChainSourceEffect,
  WORKGROUP_SIZE,
} from '../shaders/chain-source'
import type { ChainLayerInfo } from '../shaders/chain-source'
import { FieldKey, LutId } from '../brands'
import { renderExposure } from '../shaders/bodies/exposure'
import { renderContrast } from '../shaders/bodies/contrast'
import { renderSaturation } from '../shaders/bodies/saturation'
import { renderColorMixer } from '../shaders/bodies/color-mixer'
import { renderVignette } from '../shaders/bodies/vignette'
import { renderChromaticAberration } from '../shaders/bodies/chromatic-aberration'
import { renderWhiteBalance } from '../shaders/bodies/white-balance'
import { renderGrain } from '../shaders/bodies/grain'
import { renderClarity } from '../shaders/bodies/clarity'
import { renderLut } from '../shaders/bodies/lut'

/** A 13³ LUT layer as the assembler receives it from the render request. */
const lutLayer = (over: Partial<ChainLayerInfo> = {}): ChainLayerInfo => ({
  body: renderLut,
  fieldKeys: [FieldKey('amount')],
  lut: { id: LutId('luts/colorslide/fuji_velvia_50.cube'), size: 13 },
  type: 'lut',
  ...over,
})

const generateChainSource = (layers: readonly ChainLayerInfo[]) =>
  Effect.runSync(generateChainSourceEffect(layers))

describe('generateChainSource', () => {
  it('emits a single passthrough pass for an empty chain', () => {
    const result = generateChainSource([])
    expect(result.passes).toHaveLength(1)
    const pass = result.passes[0]!
    expect(pass.source).toContain('@compute')
    expect(pass.source).toContain(`@workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})`)
    expect(pass.source).toContain('textureLoad(srcTex')
    expect(pass.source).toContain('textureStore(dstTex')
    expect(pass.uniforms).toHaveLength(0)
    expect(pass.usesFrame).toBe(false)
    expect(result.usesFrame).toBe(false)
    // No colorspace conversion needed for passthrough
    expect(pass.source).not.toContain('srgbToLinear')
    expect(pass.source).not.toContain('linearToSrgb')
  })

  it('merges linearize+encode into the single pass of a one-layer chain', () => {
    const layers: ChainLayerInfo[] = [
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(1)
    const pass = result.passes[0]!
    expect(pass.source).toContain('l0_stops')
    expect(pass.source).toContain('exp2')
    // Decodes the sRGB source and re-encodes the sRGB output
    expect(pass.source).toContain('srgbToLinear(src.rgb)')
    expect(pass.source).toContain('linearToSrgb')
    // Bindings: src, dst, resolution, params (no frame for exposure)
    expect(pass.source).toContain('@group(0) @binding(0) var srcTex')
    expect(pass.source).toContain('@group(0) @binding(1) var dstTex')
    expect(pass.source).toContain('@group(0) @binding(2) var<uniform> u_resolution')
    expect(pass.source).not.toContain('@group(0) @binding(3)')
    expect(pass.source).toContain('@group(0) @binding(4) var<uniform> u_params')
    expect(pass.source).toContain('struct LayerParams')
    // The single pass is the final pass: writes the sRGB display texture
    expect(pass.source).toContain('rgba8unorm')
  })

  it('assigns uniform slots per pass', () => {
    const layers: ChainLayerInfo[] = [
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
      { body: renderContrast, fieldKeys: [FieldKey('amount')], type: 'contrast' },
      { body: renderSaturation, fieldKeys: [FieldKey('amount')], type: 'saturation' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(3)
    expect(result.passes[0]!.uniforms).toEqual([{ field: 'stops', layerIndex: 0, offset: 0 }])
    expect(result.passes[1]!.uniforms).toEqual([{ field: 'amount', layerIndex: 1, offset: 0 }])
    expect(result.passes[2]!.uniforms).toEqual([{ field: 'amount', layerIndex: 2, offset: 0 }])
  })

  it('keeps multi-field layers in one pass', () => {
    const layers: ChainLayerInfo[] = [
      { body: renderVignette, fieldKeys: [FieldKey('amount'), FieldKey('size')], type: 'vignette' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(1)
    expect(result.passes[0]!.uniforms).toEqual([
      { field: 'amount', layerIndex: 0, offset: 0 },
      { field: 'size', layerIndex: 0, offset: 1 },
    ])
    expect(result.passes[0]!.source).toContain('l0_amount: f32')
    expect(result.passes[0]!.source).toContain('l0_size: f32')
  })

  it('uses rgba16float intermediates between passes and sRGB only for the last', () => {
    const layers: ChainLayerInfo[] = [
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
      { body: renderSaturation, fieldKeys: [FieldKey('amount')], type: 'saturation' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    expect(result.passes[0]!.source).toContain('rgba16float')
    expect(result.passes[1]!.source).toContain('rgba8unorm')
    // Only the first pass decodes and only the last pass encodes (the
    // colorspace functions are always embedded; assert on call sites)
    expect(result.passes[0]!.source).toContain('srgbToLinear(src.rgb)')
    expect(result.passes[0]!.source).not.toContain('linearToSrgb(clamp')
    expect(result.passes[1]!.source).not.toContain('srgbToLinear(src.rgb)')
    expect(result.passes[1]!.source).toContain('linearToSrgb(clamp')
  })

  it('inserts a linearize pass when the first layer samples the source', () => {
    const layers: ChainLayerInfo[] = [
      {
        body: renderChromaticAberration,
        fieldKeys: [FieldKey('amount')],
        type: 'chromaticAberration',
      },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    // Pass 0: pure linearize — no layer body, no params
    expect(result.passes[0]!.uniforms).toHaveLength(0)
    expect(result.passes[0]!.source).toContain('srgbToLinear(src.rgb)')
    expect(result.passes[0]!.source).toContain('rgba16float')
    expect(result.passes[0]!.source).not.toContain('LayerParams')
    // Pass 1: CA samples the linear intermediate, no decode call in the pass itself
    expect(result.passes[1]!.source).toContain('textureSampleLevel(srcTex')
    expect(result.passes[1]!.source).not.toContain('srgbToLinear(src.rgb)')
    expect(result.passes[1]!.source).toContain('rgba8unorm')
    // Bilinear sampling at continuous offsets needs the binding-5 sampler
    expect(result.passes[1]!.usesSampler).toBe(true)
    expect(result.passes[1]!.source).toContain('@group(0) @binding(5) var samp: sampler')
    // The shift is in UV space so the fringe scales with the frame — a
    // fixed pixel offset would shrink relative to the image as
    // resolution grows and disappear on high-res photos at full view
    expect(result.passes[1]!.source).toContain('uv + dir * shift')
    expect(result.passes[1]!.source).not.toContain('(dir * shift) / u_resolution')
  })

  it('does not double-linearize when a sampling layer is not first', () => {
    const layers: ChainLayerInfo[] = [
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
      {
        body: renderChromaticAberration,
        fieldKeys: [FieldKey('amount')],
        type: 'chromaticAberration',
      },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    expect(result.passes[0]!.source).toContain('srgbToLinear(src.rgb)')
    expect(result.passes[1]!.source).not.toContain('srgbToLinear(src.rgb)')
  })

  it('inserts a linearize pass and sampler binding when the first layer samples filtered', () => {
    // Clarity samples its input with textureSample; as the first layer it
    // must read linear light, so a linearize pass precedes it and its own
    // pass carries the binding-5 sampler.
    const layers: ChainLayerInfo[] = [
      { body: renderClarity, fieldKeys: [FieldKey('amount')], type: 'clarity' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    // Pass 0: pure linearize into a linear intermediate
    expect(result.passes[0]!.source).toContain('srgbToLinear(src.rgb)')
    expect(result.passes[0]!.source).toContain('rgba16float')
    expect(result.passes[0]!.usesSampler).toBe(false)
    // Pass 1: clarity samples the linear intermediate; no decode in-pass
    expect(result.passes[1]!.source).toContain('textureSampleLevel(srcTex')
    expect(result.passes[1]!.source).not.toContain('srgbToLinear(src.rgb)')
    expect(result.passes[1]!.source).toContain('@group(0) @binding(5) var samp: sampler')
    expect(result.passes[1]!.usesSampler).toBe(true)
    // Sampler-free passes never declare binding 5
    expect(result.passes[0]!.source).not.toContain('@group(0) @binding(5)')
  })

  it('emits the Color Mixer as one pass with 24 uniform slots and its helpers', () => {
    const mixerKeys: FieldKey[] = [
      'redHue',
      'redSaturation',
      'redLuminance',
      'orangeHue',
      'orangeSaturation',
      'orangeLuminance',
      'yellowHue',
      'yellowSaturation',
      'yellowLuminance',
      'greenHue',
      'greenSaturation',
      'greenLuminance',
      'aquaHue',
      'aquaSaturation',
      'aquaLuminance',
      'blueHue',
      'blueSaturation',
      'blueLuminance',
      'purpleHue',
      'purpleSaturation',
      'purpleLuminance',
      'magentaHue',
      'magentaSaturation',
      'magentaLuminance',
    ].map(FieldKey)
    const layers: ChainLayerInfo[] = [
      { body: renderColorMixer, fieldKeys: mixerKeys, type: 'colorMixer' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(1)
    const pass = result.passes[0]!
    // 24 uniform slots, in registry field order.
    expect(pass.uniforms).toEqual(
      mixerKeys.map((key, offset) => ({ field: key, layerIndex: 0, offset })),
    )
    const { source } = pass
    // The self-contained sRGB + HSL helpers are emitted at module scope
    // (prefixed so they never collide with the pass template's own
    // srgbToLinear/linearToSrgb at chain ends).
    for (const helper of [
      'fn mixerSrgbToLinear',
      'fn mixerLinearToSrgb',
      'fn mixerRgbToHsl',
      'fn mixerHslToRgb',
      'fn mixerWeight',
    ]) {
      const idx = source.indexOf(helper)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(source.indexOf('@compute'))
    }
    // The body classifies with the 8 midpoint ranges and applies per-range
    // deltas: hue additive (×90°), saturation multiplicative, luminance
    // asymmetric.
    expect(source).toContain('mixerWeight(h, 330.0, 15.0)')
    expect(source).toContain('mixerWeight(h, 285.0, 330.0)')
    expect(source).toContain('l0_magentaLuminance')
    expect(source).toContain(' * 90.0')
    expect(source).toContain('hsl.y * (1.0 + dSaturation)')
    expect(source).toContain('dLuminance * (1.0 - hsl.z)')
    // Achromatic pixels are left untouched (hue is undefined for them).
    expect(source).toContain('if (hsl.y > 0.001)')
    // The mixer's own helpers, not the pass template's: a middle-of-chain
    // mixer has no SRGB_TO_LINEAR helpers in scope, so it must not rely on
    // them.
    expect(source).not.toContain('let c = srgbToLinear')
    expect(source).toContain('let srgb = mixerLinearToSrgb(c)')
    expect(source).toContain('color = mixerSrgbToLinear(mixerHslToRgb')
  })

  it('emits module-scope helpers ahead of the entry point', () => {
    const layers: ChainLayerInfo[] = [
      {
        body: renderGrain,
        fieldKeys: [FieldKey('texture'), FieldKey('size'), FieldKey('blur')],
        type: 'grain',
      },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(1)
    const { source } = result.passes[0]!
    const helperIdx = source.indexOf('fn grainNoise')
    expect(helperIdx).toBeGreaterThanOrEqual(0)
    expect(helperIdx).toBeLessThan(source.indexOf('@compute'))
  })

  it('flags usesFrame per pass and on the shader', () => {
    const exposure: ChainLayerInfo[] = [
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
    ]
    const result = generateChainSource(exposure)
    expect(result.usesFrame).toBe(false)
    expect(result.passes[0]!.usesFrame).toBe(false)
    expect(result.passes[0]!.source).not.toContain('u_frame')

    const withGrain: ChainLayerInfo[] = [
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
      {
        body: renderGrain,
        fieldKeys: [FieldKey('texture'), FieldKey('size'), FieldKey('blur')],
        type: 'grain',
      },
    ]
    const grainResult = generateChainSource(withGrain)
    expect(grainResult.usesFrame).toBe(true)
    expect(grainResult.passes[0]!.usesFrame).toBe(false)
    expect(grainResult.passes[1]!.usesFrame).toBe(true)
    expect(grainResult.passes[1]!.source).toContain('@group(0) @binding(3) var<uniform> u_frame')
  })

  it('emits a single sRGB-to-sRGB LUT pass for a lone LUT layer', () => {
    const result = generateChainSource([lutLayer()])
    expect(result.passes).toHaveLength(1)
    const pass = result.passes[0]!
    // The pass carries the cube id for the frontend's texture binding
    expect(pass.lutId).toBe('luts/colorslide/fuji_velvia_50.cube')
    expect(pass.uniforms).toEqual([{ field: 'amount', layerIndex: 0, offset: 0 }])
    // 3D LUT texture binding (no sampler: the body reads via textureLoad)
    expect(pass.source).not.toContain('@group(0) @binding(5) var samp: sampler')
    expect(pass.source).toContain('@group(0) @binding(6) var lutTex: texture_3d<f32>')
    // Baked cube size; the body does manual trilinear via textureLoad
    // (32-bit float textures are not filterable in WebGPU)
    expect(pass.source).toContain('const LUT_SIZE: f32 = 13.0;')
    expect(pass.source).not.toContain('LUT_SCALE')
    expect(pass.source).not.toContain('LUT_BIAS')
    expect(pass.source).toContain('textureLoad(lutTex, vec3<i32>(x0.x, x0.y, x0.z), 0)')
    expect(pass.source).toContain('let lutColor = mix(')
    expect(pass.source).not.toContain('textureSampleLevel(lutTex')
    // Both ends are sRGB (source in, display out): no color conversion at all
    expect(pass.source).not.toContain('linearToSrgb')
    expect(pass.source).not.toContain('srgbToLinear')
    expect(pass.source).toContain('var color = src.rgb;')
    expect(pass.source).toContain('let outColor = color;')
    // Final pass writes the sRGB display texture
    expect(pass.source).toContain('rgba8unorm')
    expect(pass.usesSampler).toBe(false)
    expect(pass.usesFrame).toBe(false)
  })

  it('round-trips a middle LUT pass through sRGB', () => {
    const layers: ChainLayerInfo[] = [
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
      lutLayer(),
      { body: renderSaturation, fieldKeys: [FieldKey('amount')], type: 'saturation' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(3)
    const lut = result.passes[1]!
    expect(lut.lutId).toBe('luts/colorslide/fuji_velvia_50.cube')
    // Linear intermediate in → decode to sRGB for the body
    expect(lut.source).toContain(
      'var color = linearToSrgb(clamp(src.rgb, vec3<f32>(0.0), vec3<f32>(1.0)));',
    )
    // sRGB body output → re-encode to linear for the next pass
    expect(lut.source).toContain('let outColor = srgbToLinear(color);')
    // Middle pass: linear intermediate out
    expect(lut.source).toContain('rgba16float')
    expect(lut.source).not.toContain('rgba8unorm')
    // The final pass still encodes to sRGB for the display texture
    expect(result.passes[2]!.source).toContain('linearToSrgb(clamp')
    expect(result.passes[2]!.source).toContain('rgba8unorm')
  })

  it('skips the input decode when the LUT layer is first', () => {
    const layers: ChainLayerInfo[] = [
      lutLayer(),
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    const lut = result.passes[0]!
    expect(lut.lutId).toBe('luts/colorslide/fuji_velvia_50.cube')
    // Reads the sRGB source directly — no decode call (the helper
    // function is embedded but never invoked)
    expect(lut.source).toContain('var color = src.rgb;')
    expect(lut.source).not.toContain('linearToSrgb(clamp(src.rgb')
    // Not last: re-encodes to linear for the exposure pass
    expect(lut.source).toContain('let outColor = srgbToLinear(color);')
    expect(lut.source).toContain('rgba16float')
  })

  it('does not insert a linearize pass ahead of a LUT-first chain', () => {
    // The LUT pass reads the sRGB source directly, and a sampling body
    // after it (clarity) reads the LUT pass's linear output — so no
    // extra linearize pass is needed.
    const layers: ChainLayerInfo[] = [
      lutLayer(),
      { body: renderClarity, fieldKeys: [FieldKey('amount')], type: 'clarity' },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    expect(result.passes[0]!.lutId).toBe('luts/colorslide/fuji_velvia_50.cube')
    expect(result.passes[1]!.source).toContain('textureSampleLevel(srcTex, samp')
    expect(result.passes[1]!.source).not.toContain('srgbToLinear(src.rgb)')
  })

  it('decodes a LUT pass that follows a sampling first layer', () => {
    // Clarity first: the assembler inserts a linearize pass, so the LUT
    // pass's input is a linear intermediate and needs the sRGB decode.
    const layers: ChainLayerInfo[] = [
      { body: renderClarity, fieldKeys: [FieldKey('amount')], type: 'clarity' },
      lutLayer(),
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(3)
    expect(result.passes[0]!.uniforms).toHaveLength(0)
    expect(result.passes[0]!.source).toContain('srgbToLinear(src.rgb)')
    const lut = result.passes[2]!
    expect(lut.lutId).toBe('luts/colorslide/fuji_velvia_50.cube')
    expect(lut.source).toContain('var color = linearToSrgb(clamp(src.rgb')
    // LUT pass is last: output goes straight to the sRGB display texture
    expect(lut.source).toContain('let outColor = color;')
    expect(lut.source).toContain('rgba8unorm')
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

  it('binds every uniform reference used by a body to u_params', () => {
    // WGSL struct members are only in scope through the struct variable, so
    // each `l{layerIndex}_{field}` reference a body makes must be bound to
    // `u_params.<field>` before the bodies are inlined. Without these aliases
    // the shader fails to compile (unknown identifier), which surfaces in the
    // browser as an invalid BindGroupLayout/pipeline error cascade.
    const layers: ChainLayerInfo[] = [
      { body: renderExposure, fieldKeys: [FieldKey('stops')], type: 'exposure' },
      { body: renderContrast, fieldKeys: [FieldKey('amount')], type: 'contrast' },
      {
        body: renderWhiteBalance,
        fieldKeys: [FieldKey('temp'), FieldKey('tint')],
        type: 'whiteBalance',
      },
      { body: renderSaturation, fieldKeys: [FieldKey('amount')], type: 'saturation' },
      { body: renderVignette, fieldKeys: [FieldKey('amount'), FieldKey('size')], type: 'vignette' },
      {
        body: renderChromaticAberration,
        fieldKeys: [FieldKey('amount')],
        type: 'chromaticAberration',
      },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(6)
    for (const pass of result.passes) {
      const tokens = pass.source.match(/l\d+_\w+/g) ?? []
      const unique: string[] = []
      for (const token of tokens) {
        if (!unique.includes(token)) {
          unique.push(token)
        }
      }
      for (const token of unique) {
        expect(pass.source).toContain(`let ${token} = u_params.${token};`)
      }
    }
  })
})
