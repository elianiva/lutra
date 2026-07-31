import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import {
  ExportSettings,
  defaultExportSettings,
  isLossy,
  fileExtension,
  mimeFor,
} from "./settings"

describe("ExportSettings", () => {
  it("decodes a full settings object", () => {
    expect(
      Schema.decodeSync(ExportSettings)({ format: "webp", quality: 80, scale: 0.5 }),
    ).toEqual({ format: "webp", quality: 80, scale: 0.5 })
  })

  it("accepts null quality for lossless PNG", () => {
    expect(
      Schema.decodeSync(ExportSettings)({ format: "png", quality: null, scale: 1 }),
    ).toEqual({ format: "png", quality: null, scale: 1 })
  })

  it("rejects out-of-range quality", () => {
    expect(() =>
      Schema.decodeSync(ExportSettings)({ format: "jpeg", quality: 101, scale: 1 }),
    ).toThrow()
    expect(() =>
      Schema.decodeSync(ExportSettings)({ format: "jpeg", quality: -1, scale: 1 }),
    ).toThrow()
  })

  it("rejects unknown formats", () => {
    // The payload is deliberately outside the schema's type — decodeUnknown
    // accepts it at the type level and the runtime rejects it.
    expect(() =>
      Schema.decodeUnknownSync(ExportSettings)({ format: "gif", quality: null, scale: 1 }),
    ).toThrow()
  })

  it("rejects scales outside the presets", () => {
    expect(() =>
      Schema.decodeUnknownSync(ExportSettings)({ format: "png", quality: null, scale: 0.3 }),
    ).toThrow()
  })

  it("defaults are valid settings", () => {
    expect(Schema.decodeSync(ExportSettings)(defaultExportSettings())).toEqual(
      defaultExportSettings(),
    )
  })
})

describe("format helpers", () => {
  it("isLossy flags everything but PNG", () => {
    expect(isLossy("png")).toBe(false)
    expect(isLossy("jpeg")).toBe(true)
    expect(isLossy("webp")).toBe(true)
    expect(isLossy("avif")).toBe(true)
  })

  it("fileExtension matches the format name", () => {
    expect(fileExtension("png")).toBe("png")
    expect(fileExtension("avif")).toBe("avif")
  })

  it("mimeFor maps each format to its MIME type", () => {
    expect(mimeFor("png")).toBe("image/png")
    expect(mimeFor("jpeg")).toBe("image/jpeg")
    expect(mimeFor("webp")).toBe("image/webp")
    expect(mimeFor("avif")).toBe("image/avif")
  })
})
