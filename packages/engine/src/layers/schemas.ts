import { Schema } from 'effect'
import { LayerIdSchema, LutIdSchema } from '../brands'

export const LAYER_TYPES = [
  'exposure',
  'contrast',
  'shadows',
  'highlights',
  'toneCurve',
  'whiteBalance',
  'saturation',
  'colorMixer',
  'grain',
  'vignette',
  'chromaticAberration',
  'clarity',
  'lut',
] as const

export type LayerType = (typeof LAYER_TYPES)[number]

const LayerCommon = Schema.Struct({
  id: LayerIdSchema,
  visible: Schema.Boolean,
})

export const ExposureLayer = Schema.Struct({
  ...LayerCommon.fields,
  stops: Schema.Number,
  type: Schema.Literal('exposure'),
})
export type ExposureLayer = typeof ExposureLayer.Type

export const ContrastLayer = Schema.Struct({
  ...LayerCommon.fields,
  amount: Schema.Number,
  type: Schema.Literal('contrast'),
})
export type ContrastLayer = typeof ContrastLayer.Type

export const ShadowsLayer = Schema.Struct({
  ...LayerCommon.fields,
  amount: Schema.Number,
  type: Schema.Literal('shadows'),
})
export type ShadowsLayer = typeof ShadowsLayer.Type

export const HighlightsLayer = Schema.Struct({
  ...LayerCommon.fields,
  amount: Schema.Number,
  type: Schema.Literal('highlights'),
})
export type HighlightsLayer = typeof HighlightsLayer.Type

export const WhiteBalanceLayer = Schema.Struct({
  ...LayerCommon.fields,
  temp: Schema.Number,
  tint: Schema.Number,
  type: Schema.Literal('whiteBalance'),
})
export type WhiteBalanceLayer = typeof WhiteBalanceLayer.Type

export const SaturationLayer = Schema.Struct({
  ...LayerCommon.fields,
  amount: Schema.Number,
  type: Schema.Literal('saturation'),
})
export type SaturationLayer = typeof SaturationLayer.Type

// The Color Mixer (Lightroom-style HSL panel, docs/adr/0003-adjustment-layers): eight hue

const MixerChannelFields = {
  aquaHue: Schema.Number,
  aquaLuminance: Schema.Number,
  aquaSaturation: Schema.Number,
  blueHue: Schema.Number,
  blueLuminance: Schema.Number,
  blueSaturation: Schema.Number,
  greenHue: Schema.Number,
  greenLuminance: Schema.Number,
  greenSaturation: Schema.Number,
  magentaHue: Schema.Number,
  magentaLuminance: Schema.Number,
  magentaSaturation: Schema.Number,
  orangeHue: Schema.Number,
  orangeLuminance: Schema.Number,
  orangeSaturation: Schema.Number,
  purpleHue: Schema.Number,
  purpleLuminance: Schema.Number,
  purpleSaturation: Schema.Number,
  redHue: Schema.Number,
  redLuminance: Schema.Number,
  redSaturation: Schema.Number,
  yellowHue: Schema.Number,
  yellowLuminance: Schema.Number,
  yellowSaturation: Schema.Number,
} as const

export const ColorMixerLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal('colorMixer'),
  ...MixerChannelFields,
})
export type ColorMixerLayer = typeof ColorMixerLayer.Type

export const GrainLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal('grain'),
  // chroma: color grain strength (0 = monochrome, 1 = full RGB)
  amount: Schema.Number,
  profile: Schema.Number,
  size: Schema.Number,
  chroma: Schema.Number,
})
export type GrainLayer = typeof GrainLayer.Type

export const VignetteLayer = Schema.Struct({
  ...LayerCommon.fields,
  amount: Schema.Number,
  size: Schema.Number,
  type: Schema.Literal('vignette'),
})
export type VignetteLayer = typeof VignetteLayer.Type

export const ChromaticAberrationLayer = Schema.Struct({
  ...LayerCommon.fields,
  amount: Schema.Number,
  type: Schema.Literal('chromaticAberration'),
})
export type ChromaticAberrationLayer = typeof ChromaticAberrationLayer.Type

export const ClarityLayer = Schema.Struct({
  ...LayerCommon.fields,
  amount: Schema.Number,
  type: Schema.Literal('clarity'),
})
export type ClarityLayer = typeof ClarityLayer.Type

// The Tone Curve (docs/adr/0003-adjustment-layers): 5 fixed control points — the black and
const CurvePointFields = {
  p0x: Schema.Number,
  p0y: Schema.Number,
  p1x: Schema.Number,
  p1y: Schema.Number,
  p2x: Schema.Number,
  p2y: Schema.Number,
  p3x: Schema.Number,
  p3y: Schema.Number,
  p4x: Schema.Number,
  p4y: Schema.Number,
} as const

export const ToneCurveLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal('toneCurve'),
  ...CurvePointFields,
})
export type ToneCurveLayer = typeof ToneCurveLayer.Type

export const LutLayer = Schema.Struct({
  ...LayerCommon.fields,
  type: Schema.Literal('lut'),
  // LUT map.
  lutId: LutIdSchema,
  amount: Schema.Number,
})
export type LutLayer = typeof LutLayer.Type

export const Layer = Schema.Union([
  ExposureLayer,
  ContrastLayer,
  ShadowsLayer,
  HighlightsLayer,
  WhiteBalanceLayer,
  SaturationLayer,
  ColorMixerLayer,
  GrainLayer,
  VignetteLayer,
  ChromaticAberrationLayer,
  ClarityLayer,
  ToneCurveLayer,
  LutLayer,
])
export type Layer = typeof Layer.Type

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

export const ColorMixerParams = Schema.Struct(MixerChannelFields)
export type ColorMixerParams = typeof ColorMixerParams.Type

export const GrainParams = Schema.Struct({
  amount: Schema.Number,
  profile: Schema.Number,
  size: Schema.Number,
  chroma: Schema.Number,
})
export type GrainParams = typeof GrainParams.Type

export const VignetteParams = Schema.Struct({ amount: Schema.Number, size: Schema.Number })
export type VignetteParams = typeof VignetteParams.Type

export const ChromaticAberrationParams = Schema.Struct({ amount: Schema.Number })
export type ChromaticAberrationParams = typeof ChromaticAberrationParams.Type

export const ClarityParams = Schema.Struct({ amount: Schema.Number })
export type ClarityParams = typeof ClarityParams.Type

export const ToneCurveParams = Schema.Struct(CurvePointFields)
export type ToneCurveParams = typeof ToneCurveParams.Type

export const LutParams = Schema.Struct({
  amount: Schema.Number,
  lutId: LutIdSchema,
})
export type LutParams = typeof LutParams.Type

export const LayerPatch = Schema.Union([
  Schema.Struct({ patch: ExposureParams, type: Schema.Literal('exposure') }),
  Schema.Struct({ patch: ContrastParams, type: Schema.Literal('contrast') }),
  Schema.Struct({ patch: ShadowsParams, type: Schema.Literal('shadows') }),
  Schema.Struct({ patch: HighlightsParams, type: Schema.Literal('highlights') }),
  Schema.Struct({ patch: WhiteBalanceParams, type: Schema.Literal('whiteBalance') }),
  Schema.Struct({ patch: SaturationParams, type: Schema.Literal('saturation') }),
  Schema.Struct({ patch: ColorMixerParams, type: Schema.Literal('colorMixer') }),
  Schema.Struct({ patch: GrainParams, type: Schema.Literal('grain') }),
  Schema.Struct({ patch: VignetteParams, type: Schema.Literal('vignette') }),
  Schema.Struct({ patch: ChromaticAberrationParams, type: Schema.Literal('chromaticAberration') }),
  Schema.Struct({ patch: ClarityParams, type: Schema.Literal('clarity') }),
  Schema.Struct({ patch: ToneCurveParams, type: Schema.Literal('toneCurve') }),
  Schema.Struct({ patch: LutParams, type: Schema.Literal('lut') }),
])
export type LayerPatch = typeof LayerPatch.Type
