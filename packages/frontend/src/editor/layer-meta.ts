import type { IconNode } from 'lucide'
import {
  Activity,
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
  isCurveNeutral,
  makeRegistry,
  numField,
  renderExposure,
  renderContrast,
  renderShadows,
  renderHighlights,
  renderToneCurve,
  renderWhiteBalance,
  renderSaturation,
  renderColorMixer,
  renderGrain,
  renderVignette,
  renderChromaticAberration,
  renderClarity,
  renderLut,
  UnknownLayerTypeError,
} from '@lutra/engine'
import type { Layer, LayerType, LutId } from '@lutra/engine'
import { UnknownFieldError } from '../errors'

// The engine registry owns min/max/default per field; the UI metadata below
// owns only presentation (icon, label, formatter). `fieldBounds` joins them so
// the slider view gets everything it needs in one lookup.
export const ENGINE_REGISTRY = makeRegistry({
  chromaticAberration: renderChromaticAberration,
  clarity: renderClarity,
  colorMixer: renderColorMixer,
  contrast: renderContrast,
  exposure: renderExposure,
  grain: renderGrain,
  highlights: renderHighlights,
  lut: renderLut,
  saturation: renderSaturation,
  shadows: renderShadows,
  toneCurve: renderToneCurve,
  vignette: renderVignette,
  whiteBalance: renderWhiteBalance,
})

export const fieldBounds = (type: LayerType, field: FieldKey) => {
  const entry = ENGINE_REGISTRY[type]
  if (!entry) {
    throw new UnknownLayerTypeError({ message: `Unknown layer type ${type}` })
  }
  const meta = entry.fields[field]
  if (!meta) {
    throw new UnknownFieldError({ message: `Unknown field ${field} on ${type}` })
  }
  return { max: meta.max, min: meta.min }
}

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

export interface FieldUi {
  readonly label: string
  readonly format: Formatter
}

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
  { hue: 0, key: 'red', name: 'Red' },
  { hue: 30, key: 'orange', name: 'Orange' },
  { hue: 60, key: 'yellow', name: 'Yellow' },
  { hue: 120, key: 'green', name: 'Green' },
  { hue: 180, key: 'aqua', name: 'Aqua' },
  { hue: 240, key: 'blue', name: 'Blue' },
  { hue: 270, key: 'purple', name: 'Purple' },
  { hue: 300, key: 'magenta', name: 'Magenta' },
] as const

export type MixerColor = (typeof MIXER_COLORS)[number]

/** The channel field suffixes on a Color Mixer layer, in slider order. */
export const MIXER_CHANNELS = ['Hue', 'Saturation', 'Luminance'] as const

const wbK = (v: number) => (v < 0 ? Math.round(6500 - (1 + v) * 4500) : Math.round(6500 + v * 5500))

// Film grain profile presets — each maps to shader parameters.
// The profile index is stored as a float uniform (0–4), rounded to int in the shader.
const GRAIN_PROFILES = [
  { name: 'Subtle', grainSize: 0.3, peak: 0.4, rolloff: 0.35, blur: 0.6 },
  { name: 'Medium', grainSize: 0.5, peak: 0.38, rolloff: 0.4, blur: 0.55 },
  { name: 'Heavy', grainSize: 0.7, peak: 0.35, rolloff: 0.5, blur: 0.45 },
  { name: 'Vintage', grainSize: 0.8, peak: 0.42, rolloff: 0.55, blur: 0.35 },
  { name: 'Cinematic', grainSize: 1.0, peak: 0.36, rolloff: 0.45, blur: 0.4 },
] as const

/**
 * Frontend-only metadata keyed by `LayerType`. The engine `LayerEntry`
 * owns the truth about min/max/default and the shader body; this lives
 * beside it to add the lucide icon and the value formatters (formats are
 * a presentation concern, not an engine one).
 */
export const LAYER_UI = {
  chromaticAberration: {
    description: 'Splits red and blue at the edges, like an old lens.',
    fields: { amount: { format: formatSigned, label: 'CHROMATIC ABERRATION' } },
    formatValue: (l) => formatSigned(numField(l, FieldKey('amount'))),
    icon: CircleDot,
    label: 'Chromatic Aberration',
    toggled: false,
    when: 'Add a touch of analog imperfection.',
  },
  clarity: {
    description: 'Adds punch to textures and fine detail.',
    fields: { amount: { format: formatSigned, label: 'CLARITY' } },
    formatValue: (l) => formatSigned(numField(l, FieldKey('amount'))),
    icon: Flame,
    label: 'Clarity',
    toggled: false,
    when: 'Make surfaces pop, or go softer and dreamy.',
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
          {
            format: channel === 'Hue' ? formatHue : formatPercentSigned,
            label: channel.toUpperCase(),
          },
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
          if (numField(l, FieldKey(`${color.key}${channel}`)) !== 0) {
            moved++
          }
        }
      }
      return moved === 0 ? 'No adjustments' : `${moved} slider${moved === 1 ? '' : 's'} moved`
    },
    description: 'Adjusts hue, saturation, and brightness of one color range at a time.',
    when: 'Recolor a single tone — sky, skin, grass — and leave the rest.',
  },
  contrast: {
    description: 'Deepens shadows and lifts highlights.',
    fields: { amount: { format: formatSigned, label: 'CONTRAST' } },
    formatValue: (l) => formatSigned(numField(l, FieldKey('amount'))),
    icon: Contrast,
    label: 'Contrast',
    toggled: false,
    when: 'Make a flat photo punchier, or soften it.',
  },
  exposure: {
    description: 'Brightens or darkens the whole photo.',
    fields: { stops: { format: formatEV, label: 'EXPOSURE' } },
    formatValue: (l) => formatEV(numField(l, FieldKey('stops'))),
    icon: Sun,
    label: 'Exposure',
    toggled: false,
    when: "Fix a photo that's too dark or too bright.",
  },
  grain: {
    description: 'Luminance-aware film grain with stock-specific character.',
    fields: {
      amount: { format: formatPercent, label: 'AMOUNT' },
      chroma: { format: formatPercent, label: 'CHROMA' },
      profile: {
        format: (v: number) => GRAIN_PROFILES[Math.round(v)]?.name ?? 'Medium',
        label: 'PROFILE',
      },
      size: { format: formatPercent, label: 'SIZE' },
    },
    formatValue: (l) => {
      const amt = numField(l, FieldKey('amount'))
      const prof = GRAIN_PROFILES[Math.round(numField(l, FieldKey('profile')))]?.name ?? 'Medium'
      return amt === 0 ? 'Off' : `${prof} · ${formatPercent(amt)}`
    },
    icon: Shirt,
    label: 'Grain',
    toggled: false,
    when: 'Give the photo texture, like classic film.',
  },
  highlights: {
    description: 'Lightens or darkens the brightest areas.',
    fields: { amount: { format: formatSigned, label: 'HIGHLIGHTS' } },
    formatValue: (l) => formatSigned(numField(l, FieldKey('amount'))),
    icon: Sparkles,
    label: 'Highlights',
    toggled: false,
    when: 'Recover blown-out skies and bright spots.',
  },
  lut: {
    label: 'LUT',
    icon: Boxes,
    toggled: false,
    fields: { amount: { format: formatPercent, label: 'STRENGTH' } },
    // The drawer renders the picker + "Name · %" summary for LUT layers;
    // the catalog lookup lives there (the model holds the catalog).
    formatValue: (l) => formatPercent(numField(l, FieldKey('amount'))),
    description: 'Applies the look of a classic film stock.',
    when: 'Give your photo instant analog character.',
  },
  saturation: {
    description: 'Controls how vivid the colors are.',
    fields: { amount: { format: formatSigned, label: 'SATURATION' } },
    formatValue: (l) => formatSigned(numField(l, FieldKey('amount'))),
    icon: Palette,
    label: 'Saturation',
    toggled: false,
    when: 'Make colors pop, or pull back for a faded look.',
  },
  shadows: {
    description: 'Lightens or darkens the darkest areas.',
    fields: { amount: { format: formatSigned, label: 'SHADOWS' } },
    formatValue: (l) => formatSigned(numField(l, FieldKey('amount'))),
    icon: Eclipse,
    label: 'Shadows',
    toggled: false,
    when: 'Pull detail out of underexposed shadows.',
  },
  toneCurve: {
    label: 'Tone Curve',
    icon: Activity,
    toggled: false,
    // The 10 point fields have no ruler sliders — the drawer renders the
    // curve widget instead (layer-drawer.ts branches on 'toneCurve'); these
    // labels exist for the record and for any generic fallback.
    fields: Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [
        [`p${i}x`, { format: formatPercent, label: `POINT ${i} X` }],
        [`p${i}y`, { format: formatPercent, label: `POINT ${i} Y` }],
      ]).flat(),
    ),
    // The drawer summary: the curve is either the identity or a custom
    // shape — the reset button's visibility uses the same test.
    formatValue: (l) => (isCurveNeutral(l) ? 'Neutral' : 'Custom'),
    description: 'Shapes brightness across the whole range with a draggable curve.',
    when: 'Bend the tones — an S-curve, lifted blacks, or a custom grade.',
  },
  vignette: {
    description: "Darkens or brightens the photo's edges.",
    fields: {
      amount: { format: formatSigned, label: 'VIGNETTE' },
      size: { format: formatPercent, label: 'SIZE' },
    },
    formatValue: (l) =>
      `A ${formatSigned(numField(l, FieldKey('amount')))} · ${formatPercent(numField(l, FieldKey('size')))}`,
    icon: Aperture,
    label: 'Vignette',
    toggled: true,
    when: 'Focus the center, or add a vintage frame.',
  },
  whiteBalance: {
    description: 'Shifts the color cast: warm or cool, green or magenta.',
    fields: {
      temp: { format: formatTemp, label: 'TEMPERATURE' },
      tint: { format: formatSigned, label: 'TINT' },
    },
    formatValue: (l) =>
      `${wbK(numField(l, FieldKey('temp')))} K · ${formatSigned(numField(l, FieldKey('tint')))}`,
    icon: Eye,
    label: 'White Balance',
    toggled: true,
    when: 'Use it to fix an odd cast or set a mood.',
  },
} satisfies Record<LayerType, LayerUi>

/**
 * Human name for a lutId from the catalog, falling back to the bare file
 * name when the catalog is missing the entry (e.g. a stale reference).
 */
export const lutName = (
  catalog: readonly { readonly lut_file: LutId; readonly name: string }[] | null,
  lutId: LutId,
) => {
  const entry = catalog?.find((e) => e.lut_file === lutId)
  if (entry) {
    return entry.name
  }
  return lutId.split('/').pop() ?? lutId
}

export const LAYER_TYPES_ORDER: readonly LayerType[] = [
  // The app's signature feature leads the picker (docs/adr/0016-tool-panel-cards D5): the
  // novice's most likely intent is "make my photo look like film", and the
  // LUT library is the fast path to it. Deliberate deviation from the
  // mobile reference ordering.
  'lut',
  'exposure',
  'contrast',
  'shadows',
  'highlights',
  // The tonal sibling of Highlights: a free-form bend of the whole range
  // is the natural next step after the anchored shadows/highlights pulls.
  'toneCurve',
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
