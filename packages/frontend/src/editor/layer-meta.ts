import type { IconNode } from 'lucide'
import {
  Aperture,
  Boxes,
  CircleDot,
  Contrast,
  Eclipse,
  Eye,
  Flame,
  Palette,
  Shirt,
  Sparkles,
  Sun,
} from 'lucide'
import {
  makeRegistry,
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
  type Layer,
  type LayerType,
} from '@lutra/engine'

// The engine registry owns min/max/default per field; the UI metadata below
// owns only presentation (icon, label, formatter). `fieldBounds` joins them so
// the slider view gets everything it needs in one lookup.
export const ENGINE_REGISTRY = makeRegistry({
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

export const fieldBounds = (
  type: LayerType,
  field: string,
): { readonly min: number; readonly max: number } => {
  const entry = ENGINE_REGISTRY[type]
  if (!entry) throw new Error(`Unknown layer type ${type}`)
  const meta = entry.fields[field]
  if (!meta) throw new Error(`Unknown field ${field} on ${type}`)
  return { min: meta.min, max: meta.max }
}

// ---- value formatters ----

export type Formatter = (v: number) => string

const formatSigned = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
const formatEV = (v: number): string => `${formatSigned(v)} EV`
const formatPercent = (v: number): string => `${Math.round(v * 100)}%`

// white-balance temperature maps the [-1, 1] slider to Kelvin, matching the
// mobile mapping so values line up across platforms.
const formatTemp = (v: number): string => {
  const k = v < 0 ? Math.round(6500 - (1 + v) * 4500) : Math.round(6500 + v * 5500)
  return `${k} K`
}

// ---- per-field UI metadata ----

export interface FieldUi {
  readonly label: string
  readonly format: Formatter
}

// ---- per-layer UI metadata ----

export interface LayerUi {
  readonly label: string
  readonly icon: IconNode
  readonly toggled: boolean
  /** One UI entry per numeric field on the layer, keyed identically to the engine registry. */
  readonly fields: Readonly<Record<string, FieldUi>>
  /** One-line summary of the layer's current values for the layer drawer. */
  readonly formatValue: (layer: Layer) => string
}

// Read a numeric field off a heterogeneous Layer without paying for a
// discriminated-union collapse at every call site.
const num = (layer: Layer, key: string): number => {
  const record: Record<string, unknown> = layer
  const value = record[key]
  return typeof value === 'number' ? value : NaN
}

const wbK = (v: number) =>
  v < 0 ? Math.round(6500 - (1 + v) * 4500) : Math.round(6500 + v * 5500)

/**
 * Frontend-only metadata keyed by `LayerType`. The engine `LayerEntry`
 * owns the truth about min/max/default and the shader body; this lives
 * beside it to add the lucide icon and the value formatters (formats are
 * a presentation concern, not an engine one).
 */
export const LAYER_UI: Record<LayerType, LayerUi> = {
  exposure: {
    label: 'Exposure',
    icon: Sun,
    toggled: false,
    fields: { stops: { label: 'EXPOSURE', format: formatEV } },
    formatValue: (l) => formatEV(num(l, 'stops')),
  },
  contrast: {
    label: 'Contrast',
    icon: Contrast,
    toggled: false,
    fields: { amount: { label: 'CONTRAST', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, 'amount')),
  },
  shadows: {
    label: 'Shadows',
    icon: Eclipse,
    toggled: false,
    fields: { amount: { label: 'SHADOWS', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, 'amount')),
  },
  highlights: {
    label: 'Highlights',
    icon: Sparkles,
    toggled: false,
    fields: { amount: { label: 'HIGHLIGHTS', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, 'amount')),
  },
  whiteBalance: {
    label: 'White Balance',
    icon: Eye,
    toggled: true,
    fields: {
      temp: { label: 'TEMPERATURE', format: formatTemp },
      tint: { label: 'TINT', format: formatSigned },
    },
    formatValue: (l) => `${wbK(num(l, 'temp'))} K · ${formatSigned(num(l, 'tint'))}`,
  },
  saturation: {
    label: 'Saturation',
    icon: Palette,
    toggled: false,
    fields: { amount: { label: 'SATURATION', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, 'amount')),
  },
  grain: {
    label: 'Grain',
    icon: Shirt,
    toggled: false,
    fields: {
      texture: { label: 'TEXTURE', format: formatPercent },
      size: { label: 'SIZE', format: formatPercent },
      blur: { label: 'BLUR', format: formatPercent },
    },
    formatValue: (l) =>
      `T ${formatPercent(num(l, 'texture'))} · S ${formatPercent(num(l, 'size'))} · B ${formatPercent(num(l, 'blur'))}`,
  },
  vignette: {
    label: 'Vignette',
    icon: Aperture,
    toggled: true,
    fields: {
      amount: { label: 'VIGNETTE', format: formatSigned },
      size: { label: 'SIZE', format: formatPercent },
    },
    formatValue: (l) => `A ${formatSigned(num(l, 'amount'))} · ${formatPercent(num(l, 'size'))}`,
  },
  chromaticAberration: {
    label: 'Chromatic Aberration',
    icon: CircleDot,
    toggled: false,
    fields: { amount: { label: 'CHROMATIC ABERRATION', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, 'amount')),
  },
  clarity: {
    label: 'Clarity',
    icon: Flame,
    toggled: false,
    fields: { amount: { label: 'CLARITY', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, 'amount')),
  },
  lut: {
    label: 'LUT',
    icon: Boxes,
    toggled: false,
    fields: { amount: { label: 'STRENGTH', format: formatPercent } },
    // The drawer renders the picker + "Name · %" summary for LUT layers;
    // the catalog lookup lives there (the model holds the catalog).
    formatValue: (l) => formatPercent(num(l, 'amount')),
  },
}

/**
 * Human name for a lutId from the catalog, falling back to the bare file
 * name when the catalog is missing the entry (e.g. a stale reference).
 */
export const lutName = (
  catalog: ReadonlyArray<{ readonly lut_file: string; readonly name: string }> | null,
  lutId: string,
): string => {
  const entry = catalog?.find((e) => e.lut_file === lutId)
  if (entry) return entry.name
  return lutId.split('/').pop() ?? lutId
}

export const LAYER_TYPES_ORDER: ReadonlyArray<LayerType> = [
  'exposure',
  'contrast',
  'shadows',
  'highlights',
  'whiteBalance',
  'saturation',
  'grain',
  'vignette',
  'chromaticAberration',
  'clarity',
  'lut',
]
