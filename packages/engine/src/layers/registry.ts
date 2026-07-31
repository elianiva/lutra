import type { Schema } from "effect"
import type { BodyRenderer } from "../shaders/types"
import {
  ChromaticAberrationLayer,
  ClarityLayer,
  ContrastLayer,
  ExposureLayer,
  GrainLayer,
  HighlightsLayer,
  LutLayer,
  SaturationLayer,
  ShadowsLayer,
  VignetteLayer,
  WhiteBalanceLayer,
} from "./schemas"

// ---- per-field metadata ----

export interface FieldMeta {
  default: number
  min: number
  max: number
}

// ---- per-layer entry ----

export interface LayerEntry {
  // The schema type parameter is invariant, so no single concrete type
  // fits every entry — `any` is deliberate (validated at use sites via
  // Schema.decode against the per-type schemas).
  // oxlint-disable-next-line no-explicit-any
  readonly schema: Schema.Schema<any>
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

// ---- field metadata (shared by registry and createLayer) ----

const FIELD_META = {
  exposure: { stops: { default: 0, min: -3, max: 3 } },
  contrast: { amount: { default: 0, min: -1, max: 1 } },
  shadows: { amount: { default: 0, min: -1, max: 1 } },
  highlights: { amount: { default: 0, min: -1, max: 1 } },
  whiteBalance: {
    temp: { default: 0, min: -1, max: 1 },
    tint: { default: 0, min: -1, max: 1 },
  },
  saturation: { amount: { default: 0, min: -1, max: 1 } },
  grain: {
    texture: { default: 0, min: 0, max: 1 },
    size: { default: 0, min: 0, max: 1 },
    blur: { default: 0, min: 0, max: 1 },
  },
  vignette: {
    amount: { default: 0, min: -1, max: 1 },
    size: { default: 0.6, min: 0.2, max: 1 },
  },
  chromaticAberration: { amount: { default: 0, min: -1, max: 1 } },
  clarity: { amount: { default: 0, min: -1, max: 1 } },
  // LUT defaults to full strength (1): the draft shows the look immediately.
  lut: { amount: { default: 1, min: 0, max: 1 } },
} as const satisfies Record<string, Record<string, FieldMeta>>

// ---- registry builder (bodies are injected by the index module) ----

export interface RegistryInput {
  exposure: BodyRenderer
  contrast: BodyRenderer
  shadows: BodyRenderer
  highlights: BodyRenderer
  whiteBalance: BodyRenderer
  saturation: BodyRenderer
  grain: BodyRenderer
  vignette: BodyRenderer
  chromaticAberration: BodyRenderer
  clarity: BodyRenderer
  lut: BodyRenderer
}

export function makeRegistry(bodies: RegistryInput): Record<string, LayerEntry> {
  return {
    exposure: {
      schema: ExposureLayer,
      body: bodies.exposure,
      label: "Exposure",
      pinned: true,
      fields: FIELD_META.exposure,
    },
    contrast: {
      schema: ContrastLayer,
      body: bodies.contrast,
      label: "Contrast",
      pinned: true,
      fields: FIELD_META.contrast,
    },
    shadows: {
      schema: ShadowsLayer,
      body: bodies.shadows,
      label: "Shadows",
      pinned: false,
      fields: FIELD_META.shadows,
    },
    highlights: {
      schema: HighlightsLayer,
      body: bodies.highlights,
      label: "Highlights",
      pinned: false,
      fields: FIELD_META.highlights,
    },
    whiteBalance: {
      schema: WhiteBalanceLayer,
      body: bodies.whiteBalance,
      label: "White Balance",
      pinned: true,
      toggled: true,
      fields: FIELD_META.whiteBalance,
    },
    saturation: {
      schema: SaturationLayer,
      body: bodies.saturation,
      label: "Saturation",
      pinned: true,
      fields: FIELD_META.saturation,
    },
    grain: {
      schema: GrainLayer,
      body: bodies.grain,
      label: "Grain",
      pinned: false,
      fields: FIELD_META.grain,
    },
    vignette: {
      schema: VignetteLayer,
      body: bodies.vignette,
      label: "Vignette",
      pinned: false,
      toggled: true,
      fields: FIELD_META.vignette,
    },
    chromaticAberration: {
      schema: ChromaticAberrationLayer,
      body: bodies.chromaticAberration,
      label: "Chromatic Aberration",
      pinned: false,
      fields: FIELD_META.chromaticAberration,
    },
    clarity: {
      schema: ClarityLayer,
      body: bodies.clarity,
      label: "Clarity",
      pinned: false,
      fields: FIELD_META.clarity,
    },
    lut: {
      schema: LutLayer,
      body: bodies.lut,
      label: "LUT",
      pinned: false,
      fields: FIELD_META.lut,
      // The engine cannot know which LUTs exist (the catalog is a frontend
      // asset); the frontend overrides this with the first catalog entry
      // when creating a layer. An empty id renders as "Unknown LUT".
      stringFields: { lutId: "" },
    },
  }
}

export type LayerRegistry = Record<string, LayerEntry>
