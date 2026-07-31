import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import {
  Layer,
  LayerPatch,
  LAYER_TYPES,
} from "./index"
import { ExposureLayer, ContrastLayer } from "./schemas"

describe("Layer schemas", () => {
  describe("Layer union", () => {
    it("decodes a valid exposure layer", () => {
      const result = Schema.decodeUnknownSync(Layer)({
        id: "layer-1",
        type: "exposure",
        visible: true,
        stops: 0.5,
      })
      expect(result.type).toBe("exposure")
      if (result.type === "exposure") {
        expect(result.stops).toBe(0.5)
      }
    })

    it("decodes a valid vignette layer", () => {
      const result = Schema.decodeUnknownSync(Layer)({
        id: "layer-2",
        type: "vignette",
        visible: true,
        amount: 0.3,
        size: 0.6,
      })
      expect(result.type).toBe("vignette")
      if (result.type === "vignette") {
        expect(result.amount).toBe(0.3)
        expect(result.size).toBe(0.6)
      }
    })

    it("decodes a valid whiteBalance layer", () => {
      const result = Schema.decodeUnknownSync(Layer)({
        id: "layer-3",
        type: "whiteBalance",
        visible: true,
        temp: 0.2,
        tint: -0.1,
      })
      expect(result.type).toBe("whiteBalance")
      if (result.type === "whiteBalance") {
        expect(result.temp).toBe(0.2)
        expect(result.tint).toBe(-0.1)
      }
    })

    it("fails on unknown layer type", () => {
      expect(() =>
        Schema.decodeUnknownSync(Layer)({
          id: "layer-1",
          type: "unknownType",
          visible: true,
        }),
      ).toThrow()
    })

    it("fails on missing required param", () => {
      expect(() =>
        Schema.decodeUnknownSync(Layer)({
          id: "layer-1",
          type: "exposure",
          visible: true,
          // missing "stops"
        }),
      ).toThrow()
    })

    it("strips extra properties (forward-compatible)", () => {
      const result = Schema.decodeUnknownSync(Layer)({
        id: "layer-1",
        type: "exposure",
        visible: true,
        stops: 0,
        extraField: 123,
      })
      expect(result.type).toBe("exposure")
      expect((result as Record<string, unknown>)["stops"]).toBe(0)
      // extraField is stripped by Schema
      expect((result as Record<string, unknown>)["extraField"]).toBeUndefined()
    })

    it("validates every layer type has a schema", () => {
      for (const t of LAYER_TYPES) {
        const layer: Record<string, unknown> = { id: `layer-test-${t}`, type: t, visible: true }

        if (t === "exposure") layer["stops"] = 0
        else if (t === "contrast") layer["amount"] = 0
        else if (t === "shadows") layer["amount"] = 0
        else if (t === "highlights") layer["amount"] = 0
        else if (t === "whiteBalance") { layer["temp"] = 0; layer["tint"] = 0 }
        else if (t === "saturation") layer["amount"] = 0
        else if (t === "grain") layer["amount"] = 0
        else if (t === "vignette") { layer["amount"] = 0; layer["size"] = 0.6 }
        else if (t === "chromaticAberration") layer["amount"] = 0
        else if (t === "clarity") layer["amount"] = 0

        const result = Schema.decodeUnknownSync(Layer)(layer)
        expect(result.type).toBe(t)
      }
    })
  })

  describe("LayerPatch", () => {
    it("decodes a valid exposure patch", () => {
      const result = Schema.decodeUnknownSync(LayerPatch)({
        type: "exposure",
        patch: { stops: 0.5 },
      })
      expect(result.type).toBe("exposure")
      if (result.type === "exposure") {
        expect(result.patch.stops).toBe(0.5)
      }
    })

    it("decodes a whiteBalance patch", () => {
      const result = Schema.decodeUnknownSync(LayerPatch)({
        type: "whiteBalance",
        patch: { temp: 0.2, tint: -0.1 },
      })
      expect(result.type).toBe("whiteBalance")
    })

    it("fails on patch with wrong layer type fields", () => {
      expect(() =>
        Schema.decodeUnknownSync(LayerPatch)({
          type: "exposure",
          patch: { amount: 0.5 },
        }),
      ).toThrow()
    })
  })

  describe("ExposureLayer", () => {
    it("decodes a valid exposure layer directly", () => {
      const result = Schema.decodeUnknownSync(ExposureLayer)({
        id: "layer-1",
        type: "exposure",
        visible: true,
        stops: -1.5,
      })
      expect(result.stops).toBe(-1.5)
    })

    it("fails with invalid stops type", () => {
      expect(() =>
        Schema.decodeUnknownSync(ExposureLayer)({
          id: "layer-1",
          type: "exposure",
          visible: true,
          stops: "invalid",
        }),
      ).toThrow()
    })
  })
})
