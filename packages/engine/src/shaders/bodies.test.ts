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
import { renderLut } from "../shaders/bodies/lut"

/** Statements of a body renderer result, whichever form it took. */
const bodyOf = (r: string | { stmts: string }): string =>
  typeof r === "string" ? r : r.stmts

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
    it("emits a power-curve S-curve around linear mid-grey", () => {
      const src = renderContrast(0)
      expect(src).toContain("l0_amount")
      expect(src).toContain("exp2(-l0_amount * 0.5)")
      expect(src).toContain("0.2140")
      expect(src).toContain("pow(t, vec3<f32>(gain)) * 0.2140")
      // Negative input is clamped before the power so it can't NaN
      expect(src).toContain("max(color, vec3<f32>(0.0))")
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
    it("emits FBM value-noise helpers and animated statements", () => {
      const result = renderGrain(0)
      expect(typeof result).toBe("object")
      if (typeof result === "string") {
        throw new Error("expected BodySource")
      }
      // Module-scope helpers: lattice hash, quintic easing, value noise
      expect(result.helpers).toContain("fn grainHash")
      expect(result.helpers).toContain("fn grainQuintic")
      expect(result.helpers).toContain("fn grainNoise")
      expect(result.helpers).toContain("374761393u")
      // Statements: three octaves, animated via u_frame, midtone-weighted
      expect(result.stmts).toContain("grainNoise(vec2<f32>(coord) * f, u_frame)")
      expect(result.stmts).toContain("f * 2.0")
      expect(result.stmts).toContain("f * 4.0")
      // Three knobs: texture (strength), size (cell), blur (persistence)
      expect(result.stmts).toContain("l0_texture")
      expect(result.stmts).toContain("l0_size")
      expect(result.stmts).toContain("l0_blur")
      // Log size mapping: 1.5 px (size 0) → 10 px (size 1)
      expect(result.stmts).toContain("0.6667 * pow(0.15, l0_size)")
      // Blur maps to octave persistence 0.6 → 0.15, normalized weights
      expect(result.stmts).toContain("0.6 - 0.45 * l0_blur")
      expect(result.stmts).toContain("1.0 + p + p * p")
      // Amplitude: theoretical ±0.15 linear at full texture
      expect(result.stmts).toContain("* 0.15 * w")
      expect(result.stmts).toContain("(n - 0.5) * 2.0")
      expect(result.stmts).toContain("clamp(color, vec3<f32>(0.0), vec3<f32>(1.0))")
    })
  })

  describe("renderVignette", () => {
    it("emits WGSL with aspect-corrected uv and smoothstep", () => {
      const src = renderVignette(1)
      expect(src).toContain("u_resolution")
      expect(src).toContain("uv.x *= u_resolution.x / u_resolution.y")
      expect(src).toContain("smoothstep(l1_size * 0.6, l1_size, dist)")
      expect(src).toContain("l1_amount")
      expect(src).toContain("color *= k")
    })
  })

  describe("renderChromaticAberration", () => {
    it("emits radial source sampling around the image center", () => {
      const src = bodyOf(renderChromaticAberration(0))
      expect(src).toContain("textureLoad(srcTex")
      expect(src).toContain("u_resolution * 0.5")
      expect(src).toContain("radius * radius")
      expect(src).toContain("l0_amount")
      expect(src).toContain("mix(color.r, rVal, strength)")
      expect(src).toContain("mix(color.b, bVal, strength)")
    })

    it("declares that it samples its input", () => {
      const result = renderChromaticAberration(0)
      expect(typeof result).toBe("object")
      if (typeof result === "string") throw new Error("expected BodySource")
      expect(result.samplesInput).toBe(true)
    })
  })

  describe("renderClarity", () => {
    it("emits local contrast with a bilinear 9-tap neighborhood", () => {
      const src = bodyOf(renderClarity(0))
      expect(src).toContain("textureSampleLevel(srcTex, samp")
      // Center + 8 neighbors around a 4 px radius
      expect(src).toContain("vec2<f32>(4.0) / u_resolution")
      expect(src).toContain("(1.0 / 9.0)")
      expect(src).toContain("l0_amount")
      expect(src).toContain("color - avg")
      // No longer a placeholder
      expect(src).not.toContain("placeholder")
    })

    it("declares that it samples its input", () => {
      const result = renderClarity(0)
      expect(typeof result).toBe("object")
      if (typeof result === "string") throw new Error("expected BodySource")
      expect(result.samplesInput).toBe(true)
    })
  })

  describe("renderLut", () => {
    it("emits a trilinear 3D texture lookup mixed by strength", () => {
      const result = renderLut(0)
      expect(typeof result).toBe("object")
      if (typeof result === "string") throw new Error("expected BodySource")
      // Manual trilinear over textureLoad (32-bit float textures are not
      // filterable in WebGPU, so hardware sampling is unavailable)
      expect(result.stmts).toContain("textureLoad(lutTex, vec3<i32>(x0.x, x0.y, x0.z), 0)")
      expect(result.stmts).toContain("LUT_SIZE - 1.0")
      expect(result.stmts).toContain("clamp(color, vec3<f32>(0.0), vec3<f32>(1.0))")
      expect(result.stmts).toContain("mix(color, lutColor, l0_amount)")
    })

    it("declares that it needs the LUT texture", () => {
      const result = renderLut(0)
      expect(typeof result).toBe("object")
      if (typeof result === "string") throw new Error("expected BodySource")
      expect(result.needsLut).toBe(true)
      // A LUT body samples the LUT texture, not its pass input
      expect(result.samplesInput).toBeUndefined()
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
        renderLut(0),
      ]
      for (const b of bodies) {
        expect(bodyOf(b).length).toBeGreaterThan(10)
      }
    })
  })
})
