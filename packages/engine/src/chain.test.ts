import { describe, it, expect, beforeEach } from "vitest"
import {
  createLayer,
  nextLayerId,
  _resetLayerCounter,
  makeRegistry,
  LAYER_TYPES,
} from "./layers"
import type { Layer } from "./layers"
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
  renderLut,
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
  lut: renderLut,
})

/** Read a numeric field from a layer, typed as unknown→number. */
function field(layer: Layer, key: string): number {
  const record: Record<string, unknown> = layer
  const value = record[key]
  return typeof value === "number" ? value : NaN
}

describe("createLayer", () => {
  beforeEach(() => {
    _resetLayerCounter()
  })

  it("creates every layer type with its registry defaults", () => {
    // Defaults are a product contract (e.g. vignette size 0.6, LUT amount 1
    // = full apply), so every type is pinned, not just a sample. LAYER_TYPES
    // drives the loop, so a type missing from `defaults` fails the test.
    const defaults: Record<string, Record<string, number>> = {
      exposure: { stops: 0 },
      contrast: { amount: 0 },
      shadows: { amount: 0 },
      highlights: { amount: 0 },
      whiteBalance: { temp: 0, tint: 0 },
      saturation: { amount: 0 },
      grain: { texture: 0, size: 0, blur: 0 },
      vignette: { amount: 0, size: 0.6 },
      chromaticAberration: { amount: 0 },
      clarity: { amount: 0 },
      lut: { amount: 1 },
    }
    for (const type of LAYER_TYPES) {
      const layer = createLayer(type, registry)
      expect(layer.type).toBe(type)
      expect(layer.visible).toBe(true)
      for (const [key, expected] of Object.entries(defaults[type]!)) {
        expect(field(layer, key)).toBe(expected)
      }
    }
  })

  it("assigns unique ids", () => {
    const a = createLayer("exposure", registry)
    const b = createLayer("contrast", registry)
    expect(a.id).not.toBe(b.id)
  })

  it("throws on an unknown type", () => {
    // An unknown type key reaches the registry lookup as a runtime string;
    // Object.create(null) supplies an arbitrary key without an assertion.
    expect(() => createLayer(Object.create(null), registry)).toThrow()
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
      // A fresh id from the counter is not in the chain
      const result = removeLayer(chain, nextLayerId())
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
