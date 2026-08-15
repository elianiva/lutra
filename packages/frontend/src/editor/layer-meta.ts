import type { IconNode } from 'lucide'
import {
  Aperture,
  Boxes,
  CircleDot,
  Contrast,
  Droplet,
  Eclipse,
  Eye,
  Flame,
  Palette,
  Shirt,
  Sparkles,
  Sun,
} from 'lucide'
import {
  FieldKey,
  makeRegistry,
  renderExposure,
  renderContrast,
  renderShadows,
  renderHighlights,
  renderWhiteBalance,
  renderSaturation,
  renderColorMixer,
  renderGrain,
  renderVignette,
  renderChromaticAberration,
  renderClarity,
  renderLut,
  UnknownLayerTypeError,
  type Layer,
  type LayerType,
  type LutId,
} from '@lutra/engine'
import { UnknownFieldError } from '../errors'

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
  colorMixer: renderColorMixer,
  grain: renderGrain,
  vignette: renderVignette,
  chromaticAberration: renderChromaticAberration,
  clarity: renderClarity,
  lut: renderLut,
})

export const fieldBounds = (
  type: LayerType,
  field: FieldKey,
): { readonly min: number; readonly max: number } => {
  const entry = ENGINE_REGISTRY[type]
  if (!entry) throw new UnknownLayerTypeError({ message: `Unknown layer type ${type}` })
  const meta = entry.fields[field]
  if (!meta) throw new UnknownFieldError({ message: `Unknown field ${field} on ${type}` })
  return { min: meta.min, max: meta.max }
}

// ---- value formatters ----

export type Formatter = (v: number) => string

const formatSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
const formatEV = (v: number) => `${formatSigned(v)} EV`
const formatPercent = (v: number) => `${Math.round(v * 100)}%`

// Color Mixer formatters: hue maps the [-1, 1] slider to ±90° of rotation
// (GIMP's full-deflection mapping) and saturation/luminance to ±100 points.
export const formatHue = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 90)}°`
export const formatPercentSigned = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`

// white-balance temperature maps the [-1, 1] slider to Kelvin, matching the
// mobile mapping so values line up across platforms.
const formatTemp = (v: number) => {
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
  /**
   * Plain-language "what it does" line for the tool panel card — written
   * from the shader body's actual behavior, never generic photo-editing
   * semantics (docs/adr/0016-tool-panel-cards).
   */
  readonly description: string
  /** "When to use it" line for the tool panel card (docs/adr/0016-tool-panel-cards). */
  readonly when: string
}

// The Color Mixer's 8 hue ranges (docs/adr/0027): UI order, the field-key
// prefix on the layer, the display name, and the pure-hue CSS color of the
// range's center on the hue wheel — the same centers the shader classifies
// with, so a swatch's color is exactly the color its range governs.
export const MIXER_COLORS = [
  { key: 'red', name: 'Red', hue: 0 },
  { key: 'orange', name: 'Orange', hue: 30 },
  { key: 'yellow', name: 'Yellow', hue: 60 },
  { key: 'green', name: 'Green', hue: 120 },
  { key: 'aqua', name: 'Aqua', hue: 180 },
  { key: 'blue', name: 'Blue', hue: 240 },
  { key: 'purple', name: 'Purple', hue: 270 },
  { key: 'magenta', name: 'Magenta', hue: 300 },
] as const

export type MixerColor = (typeof MIXER_COLORS)[number]

/** The channel field suffixes on a Color Mixer layer, in slider order. */
export const MIXER_CHANNELS = ['Hue', 'Saturation', 'Luminance'] as const

// Read a numeric field off a heterogeneous Layer without paying for a
// discriminated-union collapse at every call site.
const num = (layer: Layer, key: FieldKey) => {
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
    formatValue: (l) => formatEV(num(l, FieldKey('stops'))),
    description: 'Brightens or darkens the whole photo.',
    when: "Fix a photo that's too dark or too bright.",
  },
  contrast: {
    label: 'Contrast',
    icon: Contrast,
    toggled: false,
    fields: { amount: { label: 'CONTRAST', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, FieldKey('amount'))),
    description: 'Deepens shadows and lifts highlights.',
    when: 'Make a flat photo punchier, or soften it.',
  },
  shadows: {
    label: 'Shadows',
    icon: Eclipse,
    toggled: false,
    fields: { amount: { label: 'SHADOWS', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, FieldKey('amount'))),
    description: "Lightens or darkens the darkest areas.",
    when: 'Pull detail out of underexposed shadows.',
  },
  highlights: {
    label: 'Highlights',
    icon: Sparkles,
    toggled: false,
    fields: { amount: { label: 'HIGHLIGHTS', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, FieldKey('amount'))),
    description: "Lightens or darkens the brightest areas.",
    when: 'Recover blown-out skies and bright spots.',
  },
  whiteBalance: {
    label: 'White Balance',
    icon: Eye,
    toggled: true,
    fields: {
      temp: { label: 'TEMPERATURE', format: formatTemp },
      tint: { label: 'TINT', format: formatSigned },
    },
    formatValue: (l) => `${wbK(num(l, FieldKey('temp')))} K · ${formatSigned(num(l, FieldKey('tint')))}`,
    description: 'Shifts the color cast: warm or cool, green or magenta.',
    when: 'Use it to fix an odd cast or set a mood.',
  },
  saturation: {
    label: 'Saturation',
    icon: Palette,
    toggled: false,
    fields: { amount: { label: 'SATURATION', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, FieldKey('amount'))),
    description: 'Controls how vivid the colors are.',
    when: 'Make colors pop, or pull back for a faded look.',
  },
  colorMixer: {
    label: 'Color Mixer',
    icon: Droplet,
    toggled: false,
    // 24 sliders, one per range × channel. The drawer never renders them
    // generically (it shows the active range's three — layer-drawer.ts);
    // the entries still carry the labels/formats the mixer sliders read.
    fields: Object.fromEntries(
      MIXER_COLORS.flatMap((color) =>
        MIXER_CHANNELS.map((channel) => [
          `${color.key}${channel}`,
          { label: channel.toUpperCase(), format: channel === 'Hue' ? formatHue : formatPercentSigned },
        ]),
      ),
    ),
    // Fallback used nowhere today (the drawer special-cases the summary
    // with the active range's values — model context the pure function
    // can't see); kept honest: how many of the 24 sliders moved.
    formatValue: (l) => {
      let moved = 0
      for (const color of MIXER_COLORS) {
        for (const channel of MIXER_CHANNELS) {
          if (num(l, FieldKey(`${color.key}${channel}`)) !== 0) moved++
        }
      }
      return moved === 0 ? 'No adjustments' : `${moved} slider${moved === 1 ? '' : 's'} moved`
    },
    description: 'Adjusts hue, saturation, and brightness of one color range at a time.',
    when: 'Recolor a single tone — sky, skin, grass — and leave the rest.',
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
      `T ${formatPercent(num(l, FieldKey('texture')))} · S ${formatPercent(num(l, FieldKey('size')))} · B ${formatPercent(num(l, FieldKey('blur')))}`,
    description: 'Adds animated film grain for an analog feel.',
    when: 'Give the photo texture, like classic film.',
  },
  vignette: {
    label: 'Vignette',
    icon: Aperture,
    toggled: true,
    fields: {
      amount: { label: 'VIGNETTE', format: formatSigned },
      size: { label: 'SIZE', format: formatPercent },
    },
    formatValue: (l) => `A ${formatSigned(num(l, FieldKey('amount')))} · ${formatPercent(num(l, FieldKey('size')))}`,
    description: "Darkens or brightens the photo's edges.",
    when: 'Focus the center, or add a vintage frame.',
  },
  chromaticAberration: {
    label: 'Chromatic Aberration',
    icon: CircleDot,
    toggled: false,
    fields: { amount: { label: 'CHROMATIC ABERRATION', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, FieldKey('amount'))),
    description: "Splits red and blue at the edges, like an old lens.",
    when: 'Add a touch of analog imperfection.',
  },
  clarity: {
    label: 'Clarity',
    icon: Flame,
    toggled: false,
    fields: { amount: { label: 'CLARITY', format: formatSigned } },
    formatValue: (l) => formatSigned(num(l, FieldKey('amount'))),
    description: 'Adds punch to textures and fine detail.',
    when: 'Make surfaces pop, or go softer and dreamy.',
  },
  lut: {
    label: 'LUT',
    icon: Boxes,
    toggled: false,
    fields: { amount: { label: 'STRENGTH', format: formatPercent } },
    // The drawer renders the picker + "Name · %" summary for LUT layers;
    // the catalog lookup lives there (the model holds the catalog).
    formatValue: (l) => formatPercent(num(l, FieldKey('amount'))),
    description: 'Applies the look of a classic film stock.',
    when: 'Give your photo instant analog character.',
  },
}

/**
 * Human name for a lutId from the catalog, falling back to the bare file
 * name when the catalog is missing the entry (e.g. a stale reference).
 */
export const lutName = (
  catalog: ReadonlyArray<{ readonly lut_file: LutId; readonly name: string }> | null,
  lutId: LutId,
) => {
  const entry = catalog?.find((e) => e.lut_file === lutId)
  if (entry) return entry.name
  return lutId.split('/').pop() ?? lutId
}

export const LAYER_TYPES_ORDER: ReadonlyArray<LayerType> = [
  // The app's signature feature leads the picker (docs/adr/0016-tool-panel-cards D5): the
  // novice's most likely intent is "make my photo look like film", and the
  // LUT library is the fast path to it. Deliberate deviation from the
  // mobile reference ordering.
  'lut',
  'exposure',
  'contrast',
  'shadows',
  'highlights',
  'whiteBalance',
  'saturation',
  // The per-color sibling of Saturation: choosing a tone and adjusting it
  // is the natural next step after a global saturation pull.
  'colorMixer',
  'grain',
  'vignette',
  'chromaticAberration',
  'clarity',
]
