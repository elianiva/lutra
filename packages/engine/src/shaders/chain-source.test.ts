import { describe, it, expect } from "vitest"
import { generateChainSource, WORKGROUP_SIZE } from "../shaders/chain-source"
import type { ChainLayerInfo } from "../shaders/chain-source"
import { renderExposure } from "../shaders/bodies/exposure"
import { renderContrast } from "../shaders/bodies/contrast"
import { renderSaturation } from "../shaders/bodies/saturation"
import { renderVignette } from "../shaders/bodies/vignette"
import { renderChromaticAberration } from "../shaders/bodies/chromatic-aberration"
import { renderWhiteBalance } from "../shaders/bodies/white-balance"
import { renderGrain } from "../shaders/bodies/grain"
import { renderClarity } from "../shaders/bodies/clarity"

describe("generateChainSource", () => {
  it("emits a single passthrough pass for an empty chain", () => {
    const result = generateChainSource([])
    expect(result.passes).toHaveLength(1)
    const pass = result.passes[0]!
    expect(pass.source).toContain("@compute")
    expect(pass.source).toContain(`@workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})`)
    expect(pass.source).toContain("textureLoad(srcTex")
    expect(pass.source).toContain("textureStore(dstTex")
    expect(pass.uniforms).toHaveLength(0)
    expect(pass.usesFrame).toBe(false)
    expect(result.usesFrame).toBe(false)
    // No colorspace conversion needed for passthrough
    expect(pass.source).not.toContain("srgbToLinear")
    expect(pass.source).not.toContain("linearToSrgb")
  })

  it("merges linearize+encode into the single pass of a one-layer chain", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(1)
    const pass = result.passes[0]!
    expect(pass.source).toContain("l0_stops")
    expect(pass.source).toContain("exp2")
    // Decodes the sRGB source and re-encodes the sRGB output
    expect(pass.source).toContain("srgbToLinear(src.rgb)")
    expect(pass.source).toContain("linearToSrgb")
    // Bindings: src, dst, resolution, params (no frame for exposure)
    expect(pass.source).toContain("@group(0) @binding(0) var srcTex")
    expect(pass.source).toContain("@group(0) @binding(1) var dstTex")
    expect(pass.source).toContain("@group(0) @binding(2) var<uniform> u_resolution")
    expect(pass.source).not.toContain("@group(0) @binding(3)")
    expect(pass.source).toContain("@group(0) @binding(4) var<uniform> u_params")
    expect(pass.source).toContain("struct LayerParams")
    // The single pass is the final pass: writes the sRGB display texture
    expect(pass.source).toContain("rgba8unorm")
  })

  it("assigns uniform slots per pass", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
      { type: "contrast", body: renderContrast, fieldKeys: ["amount"] },
      { type: "saturation", body: renderSaturation, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(3)
    expect(result.passes[0]!.uniforms).toEqual([{ layerIndex: 0, field: "stops", offset: 0 }])
    expect(result.passes[1]!.uniforms).toEqual([{ layerIndex: 1, field: "amount", offset: 0 }])
    expect(result.passes[2]!.uniforms).toEqual([{ layerIndex: 2, field: "amount", offset: 0 }])
  })

  it("keeps multi-field layers in one pass", () => {
    const layers: ChainLayerInfo[] = [
      { type: "vignette", body: renderVignette, fieldKeys: ["amount", "size"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(1)
    expect(result.passes[0]!.uniforms).toEqual([
      { layerIndex: 0, field: "amount", offset: 0 },
      { layerIndex: 0, field: "size", offset: 1 },
    ])
    expect(result.passes[0]!.source).toContain("l0_amount: f32")
    expect(result.passes[0]!.source).toContain("l0_size: f32")
  })

  it("uses rgba16float intermediates between passes and sRGB only for the last", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
      { type: "saturation", body: renderSaturation, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    expect(result.passes[0]!.source).toContain("rgba16float")
    expect(result.passes[1]!.source).toContain("rgba8unorm")
    // Only the first pass decodes and only the last pass encodes (the
    // colorspace functions are always embedded; assert on call sites)
    expect(result.passes[0]!.source).toContain("srgbToLinear(src.rgb)")
    expect(result.passes[0]!.source).not.toContain("linearToSrgb(clamp")
    expect(result.passes[1]!.source).not.toContain("srgbToLinear(src.rgb)")
    expect(result.passes[1]!.source).toContain("linearToSrgb(clamp")
  })

  it("inserts a linearize pass when the first layer samples the source", () => {
    const layers: ChainLayerInfo[] = [
      { type: "chromaticAberration", body: renderChromaticAberration, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    // Pass 0: pure linearize — no layer body, no params
    expect(result.passes[0]!.uniforms).toHaveLength(0)
    expect(result.passes[0]!.source).toContain("srgbToLinear(src.rgb)")
    expect(result.passes[0]!.source).toContain("rgba16float")
    expect(result.passes[0]!.source).not.toContain("LayerParams")
    // Pass 1: CA samples the linear intermediate, no decode call in the pass itself
    expect(result.passes[1]!.source).toContain("textureLoad(srcTex")
    expect(result.passes[1]!.source).not.toContain("srgbToLinear(src.rgb)")
    expect(result.passes[1]!.source).toContain("rgba8unorm")
  })

  it("does not double-linearize when a sampling layer is not first", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
      { type: "chromaticAberration", body: renderChromaticAberration, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    expect(result.passes[0]!.source).toContain("srgbToLinear(src.rgb)")
    expect(result.passes[1]!.source).not.toContain("srgbToLinear(src.rgb)")
  })

  it("inserts a linearize pass and sampler binding when the first layer samples filtered", () => {
    // Clarity samples its input with textureSample; as the first layer it
    // must read linear light, so a linearize pass precedes it and its own
    // pass carries the binding-5 sampler.
    const layers: ChainLayerInfo[] = [
      { type: "clarity", body: renderClarity, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(2)
    // Pass 0: pure linearize into a linear intermediate
    expect(result.passes[0]!.source).toContain("srgbToLinear(src.rgb)")
    expect(result.passes[0]!.source).toContain("rgba16float")
    expect(result.passes[0]!.usesSampler).toBe(false)
    // Pass 1: clarity samples the linear intermediate; no decode in-pass
    expect(result.passes[1]!.source).toContain("textureSampleLevel(srcTex")
    expect(result.passes[1]!.source).not.toContain("srgbToLinear(src.rgb)")
    expect(result.passes[1]!.source).toContain("@group(0) @binding(5) var samp: sampler")
    expect(result.passes[1]!.usesSampler).toBe(true)
    // Sampler-free passes never declare binding 5
    expect(result.passes[0]!.source).not.toContain("@group(0) @binding(5)")
  })

  it("emits module-scope helpers ahead of the entry point", () => {
    const layers: ChainLayerInfo[] = [
      { type: "grain", body: renderGrain, fieldKeys: ["texture", "size", "blur"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(1)
    const source = result.passes[0]!.source
    const helperIdx = source.indexOf("fn grainNoise")
    expect(helperIdx).toBeGreaterThanOrEqual(0)
    expect(helperIdx).toBeLessThan(source.indexOf("@compute"))
  })

  it("flags usesFrame per pass and on the shader", () => {
    const exposure: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
    ]
    const result = generateChainSource(exposure)
    expect(result.usesFrame).toBe(false)
    expect(result.passes[0]!.usesFrame).toBe(false)
    expect(result.passes[0]!.source).not.toContain("u_frame")

    const withGrain: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
      { type: "grain", body: renderGrain, fieldKeys: ["texture", "size", "blur"] },
    ]
    const grainResult = generateChainSource(withGrain)
    expect(grainResult.usesFrame).toBe(true)
    expect(grainResult.passes[0]!.usesFrame).toBe(false)
    expect(grainResult.passes[1]!.usesFrame).toBe(true)
    expect(grainResult.passes[1]!.source).toContain("@group(0) @binding(3) var<uniform> u_frame")
  })

  it("binds every uniform reference used by a body to u_params", () => {
    // WGSL struct members are only in scope through the struct variable, so
    // each `l{layerIndex}_{field}` reference a body makes must be bound to
    // `u_params.<field>` before the bodies are inlined. Without these aliases
    // the shader fails to compile (unknown identifier), which surfaces in the
    // browser as an invalid BindGroupLayout/pipeline error cascade.
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
      { type: "contrast", body: renderContrast, fieldKeys: ["amount"] },
      { type: "whiteBalance", body: renderWhiteBalance, fieldKeys: ["temp", "tint"] },
      { type: "saturation", body: renderSaturation, fieldKeys: ["amount"] },
      { type: "vignette", body: renderVignette, fieldKeys: ["amount", "size"] },
      { type: "chromaticAberration", body: renderChromaticAberration, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.passes).toHaveLength(6)
    for (const pass of result.passes) {
      const tokens = pass.source.match(/l\d+_\w+/g) ?? []
      const unique: string[] = []
      for (const token of tokens) {
        if (!unique.includes(token)) unique.push(token)
      }
      for (const token of unique) {
        expect(pass.source).toContain(`let ${token} = u_params.${token};`)
      }
    }
  })
})
