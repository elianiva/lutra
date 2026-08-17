import type { HtmlBuilder } from 'foldkit/html'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Eye, EyeOff, Trash2, X, Check } from 'lucide'
import { icon } from '../components/icon'
import {
  LAYER_UI,
  MIXER_COLORS,
  MIXER_CHANNELS,
  fieldBounds,
  formatHue,
  formatPercentSigned,
  lutName,
} from './layer-meta'
import {
  SelectedLayer,
  RemovedLayer,
  ToggledLayerVisibility,
  UpdatedLayerParam,
  UpdatedDraftParam,
  ConfirmedDraft,
  CancelledDraft,
  CycledToggledField,
  SelectedMixerColor,
  ReorderedLayer,
  ToggledLutPicker,
} from './message'
import type { EditorMessage } from './message'
import type { Model } from './model'
import { toneCurveWidget } from './tone-curve'
import { FieldKey, numField } from '@lutra/engine'
import type { Layer, LayerId, LayerType } from '@lutra/engine'

/** Read a numeric field off a heterogeneous layer. */
const num = (layer: Layer, key: FieldKey): number => numField(layer, key)

/** One-line drawer summary: "Fuji Velvia 50 · 65%" for LUT layers. */
const summary = (model: Model, layer: Layer, ui: (typeof LAYER_UI)[LayerType]) =>
  layer.type === 'colorMixer'
    ? mixerSummary(model, layer)
    : layer.type === 'lut'
      ? `${lutName(model.catalog, layer.lutId)} · ${ui.formatValue(layer)}`
      : ui.formatValue(layer)

/** The active hue range of a Color Mixer layer's drawer (0..7). */
const activeMixerColor = (model: Model, layerId: LayerId) =>
  Math.min(7, Math.max(0, Math.round(model.activeMixerColor[layerId] ?? 0)))

/**
 * One-line drawer summary for a Color Mixer layer: the active range's name
 * plus its non-default slider values (the same numbers the open sliders
 * show). A pristine layer reads just "Red".
 */
const mixerSummary = (model: Model, layer: Layer) => {
  const color = MIXER_COLORS[activeMixerColor(model, layer.id)]!
  const value = (suffix: string) => numField(layer, FieldKey(`${color.key}${suffix}`))
  const parts: string[] = [color.name]
  if (value('Hue') !== 0) {
    parts.push(formatHue(value('Hue')))
  }
  if (value('Saturation') !== 0) {
    parts.push(formatPercentSigned(value('Saturation')))
  }
  if (value('Luminance') !== 0) {
    parts.push(formatPercentSigned(value('Luminance')))
  }
  return parts.join(' ')
}

/**
 * The 8 hue-range swatches (docs/adr/0027 D3): pure-hue dots at the same
 * centers the shader classifies with; the active range gets the ring.
 * Tapping dispatches SelectedMixerColor — presentation-only, no render.
 */
const mixerSwatches = (
  h: HtmlBuilder<EditorMessage>,
  active: number,
  onSelect: (index: number) => EditorMessage,
) =>
  h.div(
    [h.Class('flex items-center gap-1.5'), h.AriaLabel('Color ranges')],
    MIXER_COLORS.map((color, index) =>
      h.button(
        [
          h.OnClick(onSelect(index)),
          h.AriaLabel(`Select ${color.name}`),
          h.AriaPressed(String(index === active)),
          h.Class(
            `size-5 shrink-0 rounded-full border ${
              index === active ? 'border-ink ring-1 ring-ink' : 'border-border hover:border-muted'
            }`,
          ),
          h.Style({ background: `hsl(${color.hue} 100% 50%)` }),
        ],
        [],
      ),
    ),
  )

/**
 * The active range's three sliders — HUE / SATURATION / LUMINANCE — bound
 * to the `${color}${channel}` fields on the layer.
 */
const mixerSliders = (
  h: HtmlBuilder<EditorMessage>,
  layer: Layer,
  ui: (typeof LAYER_UI)[LayerType],
  colorIndex: number,
  onChange: (field: FieldKey, value: number) => EditorMessage,
) => {
  const color = MIXER_COLORS[colorIndex]!
  return MIXER_CHANNELS.map((channel) => {
    const field = FieldKey(`${color.key}${channel}`)
    const fieldUi = ui.fields[field]!
    const { min, max } = fieldBounds(layer.type, field)
    const value = num(layer, field)
    return sliderControl(h, fieldUi.label, fieldUi.format(value), min, max, value, (v) =>
      onChange(field, v),
    )
  })
}

/**
 * The sliders a row shows: the generic per-field list, or — for Color
 * Mixer layers — the swatch row plus the active range's three sliders.
 */
const layerSliders = (
  h: HtmlBuilder<EditorMessage>,
  model: Model,
  layer: Layer,
  ui: (typeof LAYER_UI)[LayerType],
  kind: 'draft' | 'chain',
) => {
  if (layer.type === 'colorMixer') {
    const color = activeMixerColor(model, layer.id)
    return [
      mixerSwatches(h, color, (index) => SelectedMixerColor({ color: index, id: layer.id })),
      ...mixerSliders(h, layer, ui, color, (field, value) =>
        kind === 'draft'
          ? UpdatedDraftParam({ field, value })
          : UpdatedLayerParam({ field, id: layer.id, value }),
      ),
    ]
  }
  // The Tone Curve has no sliders: the curve widget replaces the generic
  // field list entirely (the 10 point fields are meaningless as rulers —
  // docs/adr/0028).
  if (layer.type === 'toneCurve') {
    return [toneCurveWidget(h, layer)]
  }
  return Object.keys(ui.fields).map((field) =>
    kind === 'draft'
      ? draftSlider(h, layer, FieldKey(field), ui)
      : chainSlider(h, layer, FieldKey(field), ui, model),
  )
}

/**
 * The right "Layers" sidebar (docs/adr/0024-mobile-ui): always visible as a side
 * column at `lg`+, and a full-width bottom sheet below `lg` — `open` is the
 * mobile sheet state (visible only while its tab is active).
 */
export const layerDrawer = (h: HtmlBuilder<EditorMessage>, model: Model, open: boolean) =>
  h.aside(
    [
      h.Class(
        `${open ? 'flex' : 'hidden'} order-2 max-h-[45dvh] shrink-0 flex-col overflow-y-auto border-t border-border bg-panel lg:order-none lg:flex lg:max-h-none lg:w-72 lg:overflow-y-visible lg:border-l lg:border-t-0`,
      ),
      h.AriaLabel('Layers'),
    ],
    [
      h.div(
        [
          h.Class(
            'flex items-center justify-between border-b border-border px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-muted',
          ),
        ],
        [
          h.span([], ['Layers']),
          h.span([h.Class('tnum text-muted')], [String(model.chain.length)]),
        ],
      ),
      h.div(
        [h.Class('flex flex-col overflow-y-auto')],
        [
          // The draft layer renders first, above the committed chain, with its
          // confirm/cancel controls — it previews on top in the GPU pipeline
          // too. The draft itself lives in the phase machine (Drafting).
          ...(model.phase._tag === 'Drafting' ? [draftRow(h, model, model.phase.layer)] : []),
          // The chain renders bottom-up (newest at the top, like Lightroom's
          // history) so the most recent adjustment sits at eye level.
          ...model.chain.map((layer, index) => chainRow(h, model, layer, index)).reverse(),
          ...(model.chain.length === 0 && model.phase._tag !== 'Drafting' ? [emptyState(h)] : []),
        ],
      ),
    ],
  )

const emptyState = (h: HtmlBuilder<EditorMessage>) =>
  h.div(
    [h.Class('px-4 py-10 text-center text-xs text-muted')],
    ['No adjustments yet. Pick one from the left.'],
  )

const draftRow = (h: HtmlBuilder<EditorMessage>, model: Model, layer: Layer) => {
  const ui = LAYER_UI[layer.type]
  return h.div(
    [h.Class('border-b border-border bg-panel-alt'), h.AriaLabel(`${ui.label} draft`)],
    [
      h.div(
        [h.Class('flex items-center gap-2 px-4 py-2')],
        [
          icon(h, ui.icon, ui.label),
          h.span([h.Class('min-w-0 flex-1 truncate text-sm font-medium')], [ui.label]),
          // LUT rows carry the bar toggle (the bar owns browsing; the
          // drawer keeps the row's sliders).
          ...(layer.type === 'lut' ? [lutBarToggle(h, model)] : []),
        ],
      ),
      h.div(
        [h.Class('flex flex-col gap-3 px-4 pb-3')],
        [...layerSliders(h, model, layer, ui, 'draft')],
      ),
      h.div(
        [h.Class('flex items-center justify-end gap-2 px-4 py-2')],
        [
          h.button(
            [
              h.OnClick(CancelledDraft()),
              h.AriaLabel('Cancel draft'),
              h.Class('grid size-7 place-items-center text-muted hover:text-ink'),
            ],
            [icon(h, X, 'Cancel draft')],
          ),
          h.button(
            [
              h.OnClick(ConfirmedDraft()),
              h.AriaLabel('Confirm draft'),
              h.Class('grid size-7 place-items-center bg-accent text-ink'),
            ],
            [icon(h, Check, 'Confirm draft')],
          ),
        ],
      ),
    ],
  )
}

const draftSlider = (
  h: HtmlBuilder<EditorMessage>,
  layer: Layer,
  field: FieldKey,
  ui: (typeof LAYER_UI)[LayerType],
) => {
  const fieldUi = ui.fields[field]!
  const { min, max } = fieldBounds(layer.type, field)
  const value = num(layer, field)
  return sliderControl(h, fieldUi.label, fieldUi.format(value), min, max, value, (v) =>
    UpdatedDraftParam({ field, value: v }),
  )
}

const chainRow = (h: HtmlBuilder<EditorMessage>, model: Model, layer: Layer, index: number) => {
  const ui = LAYER_UI[layer.type]
  // A row is focused only in the Selected phase — the draft (Drafting) takes
  // priority and blocks new selections.
  const selected = model.phase._tag === 'Selected' && model.phase.layerId === layer.id
  const total = model.chain.length
  return h.div(
    [
      h.Class(`border-b border-border ${selected ? 'bg-panel-alt' : ''}`),
      h.DataAttribute('layer-id', layer.id),
    ],
    [
      h.div(
        [h.Class('flex items-center gap-2 px-4 py-2'), h.OnClick(SelectedLayer({ id: layer.id }))],
        [
          h.button(
            [
              h.OnClick(ToggledLayerVisibility({ id: layer.id })),
              h.AriaLabel(layer.visible ? 'Hide layer' : 'Show layer'),
              h.Class('grid size-6 place-items-center text-muted hover:text-ink'),
            ],
            [icon(h, layer.visible ? Eye : EyeOff, layer.visible ? 'Hide' : 'Show')],
          ),
          icon(h, ui.icon, ui.label),
          h.span([h.Class('min-w-0 flex-1 truncate text-sm')], [ui.label]),
          h.span(
            [h.Class('tnum min-w-0 truncate text-xs text-muted')],
            [summary(model, layer, ui)],
          ),
          h.div(
            [h.Class('flex items-center gap-0.5')],
            [
              // The chain renders bottom-up (newest at the top), so "Move up"
              // targets a higher chain index and "Move down" a lower one. A row
              // at the top of the stack can't move up; a row at the bottom can't
              // move down.
              ...(layer.type === 'lut' ? [lutBarToggle(h, model)] : []),
              reorderButton(h, 'Move up', ArrowUp, index === total - 1, () =>
                ReorderedLayer({ from: index, to: index + 1 }),
              ),
              reorderButton(h, 'Move down', ArrowDown, index === 0, () =>
                ReorderedLayer({ from: index, to: index - 1 }),
              ),
              h.button(
                [
                  h.OnClick(RemovedLayer({ id: layer.id })),
                  h.AriaLabel('Delete layer'),
                  h.Class('grid size-6 place-items-center text-muted hover:text-ink'),
                ],
                [icon(h, Trash2, 'Delete layer')],
              ),
            ],
          ),
        ],
      ),
      selected
        ? h.div(
            [h.Class('flex flex-col gap-3 px-4 pb-4')],
            [...layerSliders(h, model, layer, ui, 'chain')],
          )
        : null,
    ],
  )
}

const chainSlider = (
  h: HtmlBuilder<EditorMessage>,
  layer: Layer,
  field: FieldKey,
  ui: (typeof LAYER_UI)[LayerType],
  model: Model,
) => {
  const fieldUi = ui.fields[field]!
  const { min, max } = fieldBounds(layer.type, field)
  const value = num(layer, field)
  // For toggled layers, only the active field's slider is shown; the label
  // is clickable to cycle to the next field.
  if (ui.toggled) {
    const keys = Object.keys(ui.fields)
    const activeIndex = model.activeFieldIndex[layer.id] ?? 0
    if (keys[activeIndex] !== field) {
      return null
    }
    return sliderControl(
      h,
      fieldUi.label,
      fieldUi.format(value),
      min,
      max,
      value,
      (v) => UpdatedLayerParam({ field, id: layer.id, value: v }),
      ui.toggled,
      () => CycledToggledField({ id: layer.id }),
    )
  }
  return sliderControl(h, fieldUi.label, fieldUi.format(value), min, max, value, (v) =>
    UpdatedLayerParam({ field, id: layer.id, value: v }),
  )
}

const reorderButton = (
  h: HtmlBuilder<EditorMessage>,
  label: string,
  node: Parameters<typeof icon>[1],
  disabled: boolean,
  onClick: () => EditorMessage,
) =>
  h.button(
    [
      h.OnClick(onClick()),
      h.Disabled(disabled),
      h.AriaLabel(label),
      h.Class('grid size-6 place-items-center text-muted hover:text-ink disabled:opacity-30'),
    ],
    [icon(h, node, label)],
  )

/** The chevron on a drawer LUT row: expands/collapses the bottom LUT bar
 *  (the drawer keeps the row's summary + sliders; the bar owns browsing).
 *  Sits inside the row's clickable div, following the nested-button pattern
 *  of the visibility/reorder/delete buttons. */
const lutBarToggle = (h: HtmlBuilder<EditorMessage>, model: Model) =>
  h.button(
    [
      h.OnClick(ToggledLutPicker()),
      h.AriaExpanded(model.lutBarOpen),
      h.AriaLabel('Toggle LUT bar'),
      h.Class('grid size-6 place-items-center text-muted hover:text-ink'),
    ],
    [icon(h, model.lutBarOpen ? ChevronUp : ChevronDown, 'Toggle LUT bar')],
  )

export const sliderControl = (
  h: HtmlBuilder<EditorMessage>,
  label: string,
  display: string,
  min: number,
  max: number,
  value: number,
  onChange: (v: number) => EditorMessage,
  toggledLabel = false,
  onToggleLabel?: () => EditorMessage,
) =>
  h.div(
    [h.Class('flex flex-col gap-1')],
    [
      h.div(
        [h.Class('flex items-baseline justify-between')],
        [
          h.button(
            [
              ...(toggledLabel && onToggleLabel ? [h.OnClick(onToggleLabel())] : []),
              h.Class(
                `text-[10px] uppercase tracking-[0.14em] text-muted ${toggledLabel ? 'hover:text-ink' : 'cursor-default'}`,
              ),
            ],
            toggledLabel ? [`⇅ ${label}`] : [label],
          ),
          h.span([h.Class('tnum text-xs text-ink')], [display]),
        ],
      ),
      h.input([
        h.Type('range'),
        h.Class('lutra-range'),
        h.Min(String(min)),
        h.Max(String(max)),
        h.Step('0.01'),
        h.Value(String(value)),
        h.OnInput((raw) => onChange(Number(raw))),
      ]),
    ],
  )
