import { describe, it, expect, beforeEach } from "vitest"
import {
  createLayer,
  nextLayerId,
  _resetLayerCounter,
  makeRegistry,
} from "./layers"
import type { Layer, LayerId } from "./layers"
import {
  addLayer,
  removeLayer,
  reorderLayer,
  updateLayerParam,
  toggleLayerVisibility,
  replaceChain,
} from "./chain"
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
} from "./shaders"

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
})

/** Read a numeric field from a layer, typed as unknown→number. */
function field(layer: Layer, key: string): number {
  return (layer as Record<string, unknown>)[key] as number
}

describe("createLayer", () => {
  beforeEach(() => {
    _resetLayerCounter()
  })

  it("creates an exposure layer with default values", () => {
    const layer = createLayer("exposure", registry)
    expect(layer.type).toBe("exposure")
    expect(layer.visible).toBe(true)
    expect(layer.id).toMatch(/^layer-\d+$/)
    expect(field(layer, "stops")).toBe(0)
  })

  it("creates a whiteBalance layer with both fields", () => {
    const layer = createLayer("whiteBalance", registry)
    expect(layer.type).toBe("whiteBalance")
    expect(field(layer, "temp")).toBe(0)
    expect(field(layer, "tint")).toBe(0)
  })

  it("creates a vignette layer with correct defaults", () => {
    const layer = createLayer("vignette", registry)
    expect(layer.type).toBe("vignette")
    expect(field(layer, "amount")).toBe(0)
    expect(field(layer, "size")).toBe(0.6)
  })

  it("creates a grain layer with all defaults 0", () => {
    const layer = createLayer("grain", registry)
    expect(field(layer, "texture")).toBe(0)
    expect(field(layer, "size")).toBe(0)
    expect(field(layer, "blur")).toBe(0)
  })

  it("assigns unique ids", () => {
    const a = createLayer("exposure", registry)
    const b = createLayer("contrast", registry)
    expect(a.id).not.toBe(b.id)
  })

  it("throws on unknown type", () => {
    expect(() => createLayer("nonexistent" as unknown as "exposure", registry)).toThrow()
  })

  it("creates every layer type", () => {
    const types = ["exposure", "contrast", "shadows", "highlights", "whiteBalance",
      "saturation", "grain", "vignette", "chromaticAberration", "clarity"] as const
    for (const t of types) {
      const layer = createLayer(t, registry)
      expect(layer.type).toBe(t)
      expect(layer.visible).toBe(true)
    }
  })
})

describe("chain operations", () => {
  let chain: Layer[]

  beforeEach(() => {
    _resetLayerCounter()
    chain = []
  })

  describe("addLayer", () => {
    it("appends a layer to an empty chain", () => {
      const result = addLayer(chain, "exposure", registry)
      expect(result).toHaveLength(1)
      expect(result[0]!.type).toBe("exposure")
    })

    it("appends to end of non-empty chain", () => {
      chain = addLayer(chain, "exposure", registry)
      const result = addLayer(chain, "contrast", registry)
      expect(result).toHaveLength(2)
      expect(result[0]!.type).toBe("exposure")
      expect(result[1]!.type).toBe("contrast")
    })

    it("does not mutate the original chain", () => {
      const result = addLayer(chain, "exposure", registry)
      expect(chain).toHaveLength(0)
      expect(result).toHaveLength(1)
    })
  })

  describe("removeLayer", () => {
    it("removes a layer by id", () => {
      chain = addLayer(chain, "exposure", registry)
      const id = chain[0]!.id
      const result = removeLayer(chain, id)
      expect(result).toHaveLength(0)
    })

    it("removes only the matching layer", () => {
      chain = addLayer(chain, "exposure", registry)
      chain = addLayer(chain, "contrast", registry)
      const id = chain[0]!.id
      const result = removeLayer(chain, id)
      expect(result).toHaveLength(1)
      expect(result[0]!.type).toBe("contrast")
    })

    it("returns same chain if id not found", () => {
      chain = addLayer(chain, "exposure", registry)
      const result = removeLayer(chain, "nonexistent" as LayerId)
      expect(result).toHaveLength(1)
    })
  })

  describe("reorderLayer", () => {
    it("moves a layer from first to last", () => {
      chain = addLayer(chain, "exposure", registry)
      chain = addLayer(chain, "contrast", registry)
      chain = addLayer(chain, "saturation", registry)
      const id = chain[0]!.id
      const result = reorderLayer(chain, id, 2)
      expect(result[0]!.type).toBe("contrast")
      expect(result[1]!.type).toBe("saturation")
      expect(result[2]!.type).toBe("exposure")
    })

    it("moves a layer from last to first", () => {
      chain = addLayer(chain, "exposure", registry)
      chain = addLayer(chain, "contrast", registry)
      chain = addLayer(chain, "saturation", registry)
      const id = chain[2]!.id
      const result = reorderLayer(chain, id, 0)
      expect(result[0]!.type).toBe("saturation")
      expect(result[1]!.type).toBe("exposure")
      expect(result[2]!.type).toBe("contrast")
    })

    it("returns unchanged for invalid index", () => {
      chain = addLayer(chain, "exposure", registry)
      const id = chain[0]!.id
      const result = reorderLayer(chain, id, 99)
      expect(result[0]!.type).toBe("exposure")
    })
  })

  describe("updateLayerParam", () => {
    it("updates a parameter on a layer", () => {
      chain = addLayer(chain, "exposure", registry)
      const result = updateLayerParam(chain, {
        type: "exposure",
        patch: { stops: 1.5 },
      })
      expect(field(result[0]!, "stops")).toBe(1.5)
    })

    it("returns unchanged if type not found", () => {
      chain = addLayer(chain, "exposure", registry)
      const result = updateLayerParam(chain, {
        type: "contrast",
        patch: { amount: 0.5 },
      })
      expect(result).toHaveLength(1)
      expect(result[0]!.type).toBe("exposure")
    })

    it("does not mutate original", () => {
      chain = addLayer(chain, "exposure", registry)
      const result = updateLayerParam(chain, {
        type: "exposure",
        patch: { stops: 1.5 },
      })
      expect(field(chain[0]!, "stops")).toBe(0)
      expect(field(result[0]!, "stops")).toBe(1.5)
    })
  })

  describe("toggleLayerVisibility", () => {
    it("toggles visible from true to false", () => {
      chain = addLayer(chain, "exposure", registry)
      const id = chain[0]!.id
      const result = toggleLayerVisibility(chain, id)
      expect(result[0]!.visible).toBe(false)
    })

    it("toggles visible from false to true", () => {
      chain = addLayer(chain, "exposure", registry)
      const id = chain[0]!.id
      chain = toggleLayerVisibility(chain, id)
      const result = toggleLayerVisibility(chain, id)
      expect(result[0]!.visible).toBe(true)
    })
  })

  describe("replaceChain", () => {
    it("replaces the entire chain", () => {
      chain = addLayer(chain, "exposure", registry)
      const newLayers = addLayer([], "saturation", registry)
      const result = replaceChain(chain, newLayers)
      expect(result).toHaveLength(1)
      expect(result[0]!.type).toBe("saturation")
    })
  })
})
