import { describe, it, expect } from "vitest"
import { generateChainSource } from "../shaders/chain-source"
import type { ChainLayerInfo } from "../shaders/chain-source"
import { renderExposure } from "../shaders/bodies/exposure"
import { renderContrast } from "../shaders/bodies/contrast"
import { renderSaturation } from "../shaders/bodies/saturation"
import { renderVignette } from "../shaders/bodies/vignette"
import { renderChromaticAberration } from "../shaders/bodies/chromatic-aberration"

describe("generateChainSource", () => {
  it("generates a passthrough shader for empty chain", () => {
    const result = generateChainSource([])
    expect(result.source).toContain("@compute")
    expect(result.source).toContain("@workgroup_size(8, 8)")
    expect(result.source).toContain("textureLoad(srcTex")
    expect(result.source).toContain("textureStore(dstTex")
    expect(result.uniforms).toHaveLength(0)
    // No srgb conversions needed for passthrough
    expect(result.source).toContain("fn main")
  })

  it("generates a shader with one layer", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
    ]
    const result = generateChainSource(layers)
    // Should contain the exposure body
    expect(result.source).toContain("l0_stops")
    expect(result.source).toContain("exp2")
    // Should contain colorspace functions
    expect(result.source).toContain("srgbToLinear")
    expect(result.source).toContain("linearToSrgb")
    // Should contain bindings
    expect(result.source).toContain("@group(0) @binding(0) var srcTex")
    expect(result.source).toContain("@group(0) @binding(1) var dstTex")
    expect(result.source).toContain("@group(0) @binding(2) var<uniform> u_resolution")
    expect(result.source).toContain("@group(0) @binding(3) var<uniform> u_frame")
    expect(result.source).toContain("@group(0) @binding(4) var<uniform> u_params")
    // Should have uniform struct
    expect(result.source).toContain("struct LayerParams")
  })

  it("generates correct uniform slots for one layer", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
    ]
    const result = generateChainSource(layers)
    expect(result.uniforms).toHaveLength(1)
    expect(result.uniforms[0]).toEqual({
      layerIndex: 0,
      field: "stops",
      offset: 0,
    })
  })

  it("generates correct uniform slots for multiple layers", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
      { type: "contrast", body: renderContrast, fieldKeys: ["amount"] },
      { type: "saturation", body: renderSaturation, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.uniforms).toHaveLength(3)
    expect(result.uniforms[0]).toEqual({ layerIndex: 0, field: "stops", offset: 0 })
    expect(result.uniforms[1]).toEqual({ layerIndex: 1, field: "amount", offset: 1 })
    expect(result.uniforms[2]).toEqual({ layerIndex: 2, field: "amount", offset: 2 })
  })

  it("generates correct uniform slots for multi-field layers", () => {
    const layers: ChainLayerInfo[] = [
      { type: "vignette", body: renderVignette, fieldKeys: ["amount", "size"] },
    ]
    const result = generateChainSource(layers)
    expect(result.uniforms).toHaveLength(2)
    expect(result.uniforms[0]).toEqual({ layerIndex: 0, field: "amount", offset: 0 })
    expect(result.uniforms[1]).toEqual({ layerIndex: 0, field: "size", offset: 1 })
  })

  it("includes body blocks for each layer", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
      { type: "saturation", body: renderSaturation, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.source).toContain("l0_stops")
    expect(result.source).toContain("l1_amount")
  })

  it("includes source texture access for CA", () => {
    const layers: ChainLayerInfo[] = [
      { type: "chromaticAberration", body: renderChromaticAberration, fieldKeys: ["amount"] },
    ]
    const result = generateChainSource(layers)
    expect(result.source).toContain("textureLoad(srcTex")
  })

  it("generates valid WGSL structure markers", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
    ]
    const result = generateChainSource(layers)
    // Must have required WGSL elements
    expect(result.source).toMatch(/@compute/)
    expect(result.source).toMatch(/@workgroup_size/)
    expect(result.source).toMatch(/fn main/)
    expect(result.source).toMatch(/@builtin\(global_invocation_id\)/)
    // Must have struct for uniforms
    expect(result.source).toContain("struct LayerParams")
    expect(result.source).toContain("l0_stops: f32")
    // Must have output store
    expect(result.source).toContain("textureStore")
  })

  it("generates uniform struct with all fields", () => {
    const layers: ChainLayerInfo[] = [
      { type: "exposure", body: renderExposure, fieldKeys: ["stops"] },
      { type: "vignette", body: renderVignette, fieldKeys: ["amount", "size"] },
    ]
    const result = generateChainSource(layers)
    expect(result.source).toContain("l0_stops: f32")
    expect(result.source).toContain("l1_amount: f32")
    expect(result.source).toContain("l1_size: f32")
  })
})
