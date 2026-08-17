import type { Schema } from 'effect'
import type { BodyRenderer } from '../shaders/types'
import { CURVE_DEFAULT_POINTS, CURVE_POINT_COUNT } from './curve'
import {
  ChromaticAberrationLayer,
  ClarityLayer,
  ColorMixerLayer,
  ContrastLayer,
  ExposureLayer,
  GrainLayer,
  HighlightsLayer,
  LutLayer,
  SaturationLayer,
  ShadowsLayer,
  ToneCurveLayer,
  VignetteLayer,
  WhiteBalanceLayer,
} from './schemas'
import type { Layer } from './schemas'

export interface FieldMeta {
  default: number
  min: number
  max: number
}

export interface LayerEntry {
  // Entries own their concrete schemas, but the registry only needs their
  // decoding contract. A constraint decoder keeps that boundary sound while
  // allowing every layer schema to participate in the registry.
  readonly schema: Schema.ConstraintDecoder<Layer>
  readonly body: BodyRenderer
  readonly label: string
  readonly pinned: boolean
  readonly toggled?: boolean
  /** Numeric fields: packed as f32 uniforms, one slot per field. */
  readonly fields: Record<string, FieldMeta>
  /**
   * String-typed fields (e.g. the LUT layer's `lutId` reference). Not
   * uniforms — they ride on the layer object and are resolved at render
   * time. Values are the defaults `createLayer` writes.
   */
  readonly stringFields?: Readonly<Record<string, string>>
}

const FIELD_META = {
  exposure: { stops: { default: 0, max: 3, min: -3 } },
  contrast: { amount: { default: 0, max: 1, min: -1 } },
  shadows: { amount: { default: 0, max: 1, min: -1 } },
  highlights: { amount: { default: 0, max: 1, min: -1 } },
  whiteBalance: {
    temp: { default: 0, max: 1, min: -1 },
    tint: { default: 0, max: 1, min: -1 },
  },
  saturation: { amount: { default: 0, max: 1, min: -1 } },
  // The Color Mixer: 24 fields (8 hue ranges × hue/saturation/luminance),
  // all normalized [-1, 1]. The shader maps hue to ±180° of rotation and
  // saturation/luminance to multiplicative/asymmetric lightness deltas
  // (docs/adr/0027 D2).
  colorMixer: {
    aquaHue: { default: 0, max: 1, min: -1 },
    aquaLuminance: { default: 0, max: 1, min: -1 },
    aquaSaturation: { default: 0, max: 1, min: -1 },
    blueHue: { default: 0, max: 1, min: -1 },
    blueLuminance: { default: 0, max: 1, min: -1 },
    blueSaturation: { default: 0, max: 1, min: -1 },
    greenHue: { default: 0, max: 1, min: -1 },
    greenLuminance: { default: 0, max: 1, min: -1 },
    greenSaturation: { default: 0, max: 1, min: -1 },
    magentaHue: { default: 0, max: 1, min: -1 },
    magentaLuminance: { default: 0, max: 1, min: -1 },
    magentaSaturation: { default: 0, max: 1, min: -1 },
    orangeHue: { default: 0, max: 1, min: -1 },
    orangeLuminance: { default: 0, max: 1, min: -1 },
    orangeSaturation: { default: 0, max: 1, min: -1 },
    purpleHue: { default: 0, max: 1, min: -1 },
    purpleLuminance: { default: 0, max: 1, min: -1 },
    purpleSaturation: { default: 0, max: 1, min: -1 },
    redHue: { default: 0, max: 1, min: -1 },
    redLuminance: { default: 0, max: 1, min: -1 },
    redSaturation: { default: 0, max: 1, min: -1 },
    yellowHue: { default: 0, max: 1, min: -1 },
    yellowLuminance: { default: 0, max: 1, min: -1 },
    yellowSaturation: { default: 0, max: 1, min: -1 },
  },
  grain: {
    amount: { default: 0, max: 1, min: 0 },
    profile: { default: 1, max: 4, min: 0 },
    size: { default: 0, max: 1, min: 0 },
    chroma: { default: 0.2, max: 1, min: 0 },
  },
  vignette: {
    amount: { default: 0, max: 1, min: -1 },
    size: { default: 0.6, max: 1, min: 0.2 },
  },
  chromaticAberration: { amount: { default: 0, max: 1, min: -1 } },
  clarity: { amount: { default: 0, max: 1, min: -1 } },
  // The Tone Curve's 5 control points (docs/adr/0028), one field per axis
  // (p0x..p4y), all in [0, 1]. The identity defaults come from the curve
  // module so the registry, the shader's reference, and the widget's reset
  // target can never drift apart.
  toneCurve: Object.fromEntries(
    Array.from({ length: CURVE_POINT_COUNT }, (_, i) => [
      [`p${i}x`, { default: CURVE_DEFAULT_POINTS[i]!.x, max: 1, min: 0 }],
      [`p${i}y`, { default: CURVE_DEFAULT_POINTS[i]!.y, max: 1, min: 0 }],
    ]).flat(),
  ),
  // LUT defaults to full strength (1): the draft shows the look immediately.
  lut: { amount: { default: 1, max: 1, min: 0 } },
} as const satisfies Record<string, Record<string, FieldMeta>>

export interface RegistryInput {
  exposure: BodyRenderer
  contrast: BodyRenderer
  shadows: BodyRenderer
  highlights: BodyRenderer
  toneCurve: BodyRenderer
  whiteBalance: BodyRenderer
  saturation: BodyRenderer
  colorMixer: BodyRenderer
  grain: BodyRenderer
  vignette: BodyRenderer
  chromaticAberration: BodyRenderer
  clarity: BodyRenderer
  lut: BodyRenderer
}

export function makeRegistry(bodies: RegistryInput): LayerRegistry {
  return {
    chromaticAberration: {
      body: bodies.chromaticAberration,
      fields: FIELD_META.chromaticAberration,
      label: 'Chromatic Aberration',
      pinned: false,
      schema: ChromaticAberrationLayer,
    },
    clarity: {
      body: bodies.clarity,
      fields: FIELD_META.clarity,
      label: 'Clarity',
      pinned: false,
      schema: ClarityLayer,
    },
    colorMixer: {
      body: bodies.colorMixer,
      fields: FIELD_META.colorMixer,
      label: 'Color Mixer',
      pinned: false,
      schema: ColorMixerLayer,
    },
    contrast: {
      body: bodies.contrast,
      fields: FIELD_META.contrast,
      label: 'Contrast',
      pinned: true,
      schema: ContrastLayer,
    },
    exposure: {
      body: bodies.exposure,
      fields: FIELD_META.exposure,
      label: 'Exposure',
      pinned: true,
      schema: ExposureLayer,
    },
    grain: {
      body: bodies.grain,
      fields: FIELD_META.grain,
      label: 'Grain',
      pinned: false,
      schema: GrainLayer,
    },
    highlights: {
      body: bodies.highlights,
      fields: FIELD_META.highlights,
      label: 'Highlights',
      pinned: false,
      schema: HighlightsLayer,
    },
    lut: {
      schema: LutLayer,
      body: bodies.lut,
      label: 'LUT',
      pinned: false,
      fields: FIELD_META.lut,
      // The engine cannot know which LUTs exist (the catalog is a frontend
      // asset); the frontend overrides this with the first catalog entry
      // when creating a layer. An empty id renders as "Unknown LUT".
      stringFields: { lutId: '' },
    },
    saturation: {
      body: bodies.saturation,
      fields: FIELD_META.saturation,
      label: 'Saturation',
      pinned: true,
      schema: SaturationLayer,
    },
    shadows: {
      body: bodies.shadows,
      fields: FIELD_META.shadows,
      label: 'Shadows',
      pinned: false,
      schema: ShadowsLayer,
    },
    toneCurve: {
      body: bodies.toneCurve,
      fields: FIELD_META.toneCurve,
      label: 'Tone Curve',
      pinned: true,
      schema: ToneCurveLayer,
    },
    vignette: {
      body: bodies.vignette,
      fields: FIELD_META.vignette,
      label: 'Vignette',
      pinned: false,
      schema: VignetteLayer,
      toggled: true,
    },
    whiteBalance: {
      body: bodies.whiteBalance,
      fields: FIELD_META.whiteBalance,
      label: 'White Balance',
      pinned: true,
      schema: WhiteBalanceLayer,
      toggled: true,
    },
  }
}

export interface LayerRegistry {
  readonly chromaticAberration: LayerEntry
  readonly clarity: LayerEntry
  readonly colorMixer: LayerEntry
  readonly contrast: LayerEntry
  readonly exposure: LayerEntry
  readonly grain: LayerEntry
  readonly highlights: LayerEntry
  readonly lut: LayerEntry
  readonly saturation: LayerEntry
  readonly shadows: LayerEntry
  readonly toneCurve: LayerEntry
  readonly vignette: LayerEntry
  readonly whiteBalance: LayerEntry
}
