import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { createRenderRequest } from "./render"
import { createLayer, makeRegistry } from "./layers"
import { nextLayerId } from "./layers"
import type { Layer } from "./layers"
import {
  renderExposure,
  renderContrast,
  renderShadows,
  renderHighlights,
  renderWhiteBalance,
  renderSaturation,
  renderGrain,
  renderVignette,
  renderChromaticAberration,
  renderClarity,
  renderLut,
} from "./shaders"
import type { LutCube } from "./luts/cube"

// ---- helpers ----

const registry = makeRegistry({
  exposure: renderExposure,
  contrast: renderContrast,
  shadows: renderShadows,
  highlights: renderHighlights,
  whiteBalance: renderWhiteBalance,
  saturation: renderSaturation,
  grain: renderGrain,
  vignette: renderVignette,
  chromaticAberration: renderChromaticAberration,
  clarity: renderClarity,
  lut: renderLut,
})

// createRenderRequest never touches the bitmap (the GPU backend does); the
// test env has no ImageBitmap constructor, so a structural stand-in is fine.
class FakeBitmap implements ImageBitmap {
  readonly width = 0
  readonly height = 0
  close(): void {}
}

const fakeBitmap = (): ImageBitmap => new FakeBitmap()

const cube2: LutCube = { size: 2, data: new Float32Array(8 * 3) }

const lutsWith = (lutId: string, cube: LutCube): ReadonlyMap<string, LutCube> => {
  const luts = new Map<string, LutCube>()
  luts.set(lutId, cube)
  return luts
}

// Contextually typed by the return annotation — no assertion needed.
const lutLayer = (lutId: string): Layer => ({
  id: nextLayerId(),
  visible: true,
  type: "lut",
  lutId,
  amount: 1,
})

const VELVIA = "luts/colorslide/fuji_velvia_50.cube"

// ---- tests ----

describe("createRenderRequest with LUT layers", () => {
  it("resolves LUT layers through the LUT map into the pass", () => {
    const luts = lutsWith(VELVIA, cube2)
    const request = Effect.runSync(
      createRenderRequest([lutLayer(VELVIA)], registry, fakeBitmap(), 0, luts),
    )
    expect(request.shader.passes).toHaveLength(1)
    expect(request.shader.passes[0]!.lutId).toBe(VELVIA)
    // The cube size is baked into the shader source
    expect(request.shader.passes[0]!.source).toContain("const LUT_SIZE: f32 = 2.0;")
    // Only `amount` is a uniform slot (lutId is not a uniform)
    expect(request.shader.passes[0]!.uniforms).toEqual([
      { layerIndex: 0, field: "amount", offset: 0 },
    ])
    // Amount packs from the layer value
    expect(request.uniforms[0]![0]).toBe(1)
    expect(request.luts.get(VELVIA)).toBe(cube2)
  })

  it("creates LUT layers with the registry string-field default", () => {
    const layer = createLayer("lut", registry)
    expect(layer.type).toBe("lut")
    if (layer.type === "lut") {
      // The engine default is empty — the frontend fills the first catalog id
      expect(layer.lutId).toBe("")
      expect(layer.amount).toBe(1)
    }
  })

  it("fails with GpuError when a LUT layer references an unknown id", () => {
    const message = Effect.runSync(
      Effect.catchTag(
        createRenderRequest([lutLayer("luts/does/not_exist.cube")], registry, fakeBitmap(), 0, new Map()),
        "GpuError",
        (err) => Effect.succeed(err.message),
      ),
    )
    expect(message).toContain("Unknown LUT: luts/does/not_exist.cube")
  })

  it("hides LUT layers like any other layer", () => {
    const hidden: Layer = {
      id: nextLayerId(),
      visible: false,
      type: "lut",
      lutId: VELVIA,
      amount: 1,
    }
    const request = Effect.runSync(
      createRenderRequest([hidden], registry, fakeBitmap(), 0, lutsWith(VELVIA, cube2)),
    )
    // Passthrough: no LUT pass, and the empty map is never consulted
    expect(request.shader.passes).toHaveLength(1)
    expect(request.shader.passes[0]!.lutId).toBeUndefined()
  })
})
