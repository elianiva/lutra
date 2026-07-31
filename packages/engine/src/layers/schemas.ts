import { Schema } from "effect"

// ---- branded primitives ----

/** Branded layer identifier. */
export const LayerId = Schema.String.pipe(Schema.brand("LayerId"))
export type LayerId = typeof LayerId.Type

// ---- layer type literal ----

export const LAYER_TYPES = [
  "exposure",
  "contrast",
  "shadows",
  "highlights",
  "whiteBalance",
  "saturation",
  "grain",
  "vignette",
  "chromaticAberration",
  "clarity",
  "lut",
] as const

export type LayerType = (typeof LAYER_TYPES)[number]

// ---- common fields ----

const LayerCommon = Schema.Struct({
  id: LayerId,
  visible: Schema.Boolean,
})

// ---- per-layer param schemas ----

export const ExposureLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("exposure"),
  stops: Schema.Number,
})
export type ExposureLayer = typeof ExposureLayer.Type

export const ContrastLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("contrast"),
  amount: Schema.Number,
})
export type ContrastLayer = typeof ContrastLayer.Type

export const ShadowsLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("shadows"),
  amount: Schema.Number,
})
export type ShadowsLayer = typeof ShadowsLayer.Type

export const HighlightsLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("highlights"),
  amount: Schema.Number,
})
export type HighlightsLayer = typeof HighlightsLayer.Type

export const WhiteBalanceLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("whiteBalance"),
  temp: Schema.Number,
  tint: Schema.Number,
})
export type WhiteBalanceLayer = typeof WhiteBalanceLayer.Type

export const SaturationLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("saturation"),
  amount: Schema.Number,
})
export type SaturationLayer = typeof SaturationLayer.Type

export const GrainLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("grain"),
  // Snapseed-style grain knobs: texture = strength, size = noise cell
  // size, blur = octave persistence (softness).
  texture: Schema.Number,
  size: Schema.Number,
  blur: Schema.Number,
})
export type GrainLayer = typeof GrainLayer.Type

export const VignetteLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("vignette"),
  amount: Schema.Number,
  size: Schema.Number,
})
export type VignetteLayer = typeof VignetteLayer.Type

export const ChromaticAberrationLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("chromaticAberration"),
  amount: Schema.Number,
})
export type ChromaticAberrationLayer = typeof ChromaticAberrationLayer.Type

export const ClarityLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("clarity"),
  amount: Schema.Number,
})
export type ClarityLayer = typeof ClarityLayer.Type

export const LutLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal("lut"),
  // Reference into the LUT library (the vendored file path, e.g.
  // "luts/colorslide/fuji_velvia_50.cube"). A string, not a uniform — the
  // engine resolves it to a cube via the render request's LUT map.
  lutId: Schema.String,
  amount: Schema.Number,
})
export type LutLayer = typeof LutLayer.Type

// ---- discriminated union: the Layer type ----

export const Layer = Schema.Union([
  ExposureLayer,
  ContrastLayer,
  ShadowsLayer,
  HighlightsLayer,
  WhiteBalanceLayer,
  SaturationLayer,
  GrainLayer,
  VignetteLayer,
  ChromaticAberrationLayer,
  ClarityLayer,
  LutLayer,
])
export type Layer = typeof Layer.Type

// ---- param-only schemas (for patch validation) ----

export const ExposureParams = Schema.Struct({ stops: Schema.Number })
export type ExposureParams = typeof ExposureParams.Type

export const ContrastParams = Schema.Struct({ amount: Schema.Number })
export type ContrastParams = typeof ContrastParams.Type

export const ShadowsParams = Schema.Struct({ amount: Schema.Number })
export type ShadowsParams = typeof ShadowsParams.Type

export const HighlightsParams = Schema.Struct({ amount: Schema.Number })
export type HighlightsParams = typeof HighlightsParams.Type

export const WhiteBalanceParams = Schema.Struct({ temp: Schema.Number, tint: Schema.Number })
export type WhiteBalanceParams = typeof WhiteBalanceParams.Type

export const SaturationParams = Schema.Struct({ amount: Schema.Number })
export type SaturationParams = typeof SaturationParams.Type

export const GrainParams = Schema.Struct({
  texture: Schema.Number,
  size: Schema.Number,
  blur: Schema.Number,
})
export type GrainParams = typeof GrainParams.Type

export const VignetteParams = Schema.Struct({ amount: Schema.Number, size: Schema.Number })
export type VignetteParams = typeof VignetteParams.Type

export const ChromaticAberrationParams = Schema.Struct({ amount: Schema.Number })
export type ChromaticAberrationParams = typeof ChromaticAberrationParams.Type

export const ClarityParams = Schema.Struct({ amount: Schema.Number })
export type ClarityParams = typeof ClarityParams.Type

export const LutParams = Schema.Struct({
  lutId: Schema.String,
  amount: Schema.Number,
})
export type LutParams = typeof LutParams.Type

// ---- patch discriminated union ----

export const LayerPatch = Schema.Union([
  Schema.Struct({ type: Schema.Literal("exposure"), patch: ExposureParams }),
  Schema.Struct({ type: Schema.Literal("contrast"), patch: ContrastParams }),
  Schema.Struct({ type: Schema.Literal("shadows"), patch: ShadowsParams }),
  Schema.Struct({ type: Schema.Literal("highlights"), patch: HighlightsParams }),
  Schema.Struct({ type: Schema.Literal("whiteBalance"), patch: WhiteBalanceParams }),
  Schema.Struct({ type: Schema.Literal("saturation"), patch: SaturationParams }),
  Schema.Struct({ type: Schema.Literal("grain"), patch: GrainParams }),
  Schema.Struct({ type: Schema.Literal("vignette"), patch: VignetteParams }),
  Schema.Struct({ type: Schema.Literal("chromaticAberration"), patch: ChromaticAberrationParams }),
  Schema.Struct({ type: Schema.Literal("clarity"), patch: ClarityParams }),
  Schema.Struct({ type: Schema.Literal("lut"), patch: LutParams }),
])
export type LayerPatch = typeof LayerPatch.Type
