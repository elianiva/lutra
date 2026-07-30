import { describe, it, expect } from "vitest"
import { renderExposure } from "../shaders/bodies/exposure"
import { renderContrast } from "../shaders/bodies/contrast"
import { renderShadows } from "../shaders/bodies/shadows"
import { renderHighlights } from "../shaders/bodies/highlights"
import { renderWhiteBalance } from "../shaders/bodies/white-balance"
import { renderSaturation } from "../shaders/bodies/saturation"
import { renderGrain } from "../shaders/bodies/grain"
import { renderVignette } from "../shaders/bodies/vignette"
import { renderChromaticAberration } from "../shaders/bodies/chromatic-aberration"
import { renderClarity } from "../shaders/bodies/clarity"

describe("shader bodies", () => {
  describe("renderExposure", () => {
    it("emits WGSL with indexed uniforms", () => {
      const src = renderExposure(0)
      expect(src).toContain("l0_stops")
      expect(src).toContain("exp2")
      expect(src).toContain("color *= gain")
    })

    it("uses correct index for later layers", () => {
      const src = renderExposure(3)
      expect(src).toContain("l3_stops")
    })
  })

  describe("renderContrast", () => {
    it("emits WGSL with mid-grey anchor", () => {
      const src = renderContrast(0)
      expect(src).toContain("0.2140")
      expect(src).toContain("clamp(l0_amount, -0.99, 0.99)")
      expect(src).toContain("select")
    })
  })

  describe("renderShadows", () => {
    it("emits WGSL with luma dot and smoothstep mask", () => {
      const src = renderShadows(0)
      expect(src).toContain("dot(color, vec3<f32>(0.2126, 0.7152, 0.0722))")
      expect(src).toContain("smoothstep(0.0, 0.5, luma)")
      expect(src).toContain("0.15")
    })
  })

  describe("renderHighlights", () => {
    it("emits WGSL with pow mask", () => {
      const src = renderHighlights(1)
      expect(src).toContain("pow(luma, 2.2)")
      expect(src).toContain("l1_amount")
      expect(src).toContain("0.2")
    })
  })

  describe("renderWhiteBalance", () => {
    it("emits WGSL with temp and tint uniforms", () => {
      const src = renderWhiteBalance(2)
      expect(src).toContain("l2_temp")
      expect(src).toContain("l2_tint")
      expect(src).toContain("color.r *=")
      expect(src).toContain("color.b *=")
      expect(src).toContain("color.g *=")
    })
  })

  describe("renderSaturation", () => {
    it("emits WGSL with luma mix", () => {
      const src = renderSaturation(0)
      expect(src).toContain("luma")
      expect(src).toContain("mix(vec3<f32>(luma), color, 1.0 + l0_amount)")
    })
  })

  describe("renderGrain", () => {
    it("emits WGSL with hash noise", () => {
      const src = renderGrain(0)
      expect(src).toContain("fract(sin(dot(")
      expect(src).toContain("u_frame")
      expect(src).toContain("l0_amount")
      expect(src).toContain("clamp(color, vec3<f32>(0.0), vec3<f32>(1.0))")
    })
  })

  describe("renderVignette", () => {
    it("emits WGSL with uv and smoothstep", () => {
      const src = renderVignette(1)
      expect(src).toContain("u_resolution")
      expect(src).toContain("smoothstep(l1_size * 0.6, l1_size, dist)")
      expect(src).toContain("l1_amount")
      expect(src).toContain("color *= k")
    })
  })

  describe("renderChromaticAberration", () => {
    it("emits WGSL with source texture sampling", () => {
      const src = renderChromaticAberration(0)
      expect(src).toContain("textureLoad(srcTex")
      expect(src).toContain("l0_amount")
      expect(src).toContain("mix(color.r, rVal, strength)")
      expect(src).toContain("mix(color.b, bVal, strength)")
    })
  })

  describe("renderClarity", () => {
    it("emits WGSL placeholder with midtone lift", () => {
      const src = renderClarity(0)
      expect(src).toContain("placeholder")
      expect(src).toContain("l0_amount")
    })
  })

  describe("all bodies", () => {
    it("each body emits a non-empty string", () => {
      const bodies = [
        renderExposure(0),
        renderContrast(0),
        renderShadows(0),
        renderHighlights(0),
        renderWhiteBalance(0),
        renderSaturation(0),
        renderGrain(0),
        renderVignette(0),
        renderChromaticAberration(0),
        renderClarity(0),
      ]
      for (const b of bodies) {
        expect(b.length).toBeGreaterThan(10)
      }
    })
  })
})
