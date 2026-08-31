import { type Html, type HtmlBuilder, createKeyedLazy, createLazy } from 'foldkit/html'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Eye, EyeOff, Trash2, X, Check } from 'lucide'
import { button } from '@/components/ui/button'
import { lutraRangeRow } from '@/components/lutra-range-row'
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
import { EditorMessage } from './message'
import type { Model } from './model'
import { toneCurveWidget } from './tone-curve'
import { FieldKey, numField } from '@lutra/engine'
import type { Layer, LayerId, LayerType } from '@lutra/engine'

type LayerRowSlice = Pick<Model, 'catalog' | 'lutBarOpen' | 'activeFieldIndex' | 'activeMixerColor'>

export type LayerDrawerSlice = Pick<
  Model,
  'chain' | 'phase' | 'lutBarOpen' | 'catalog' | 'activeFieldIndex' | 'activeMixerColor'
>

/** Read a numeric field off a heterogeneous layer. */
const num = (layer: Layer, key: FieldKey): number => numField(layer, key)

/** One-line drawer summary: "Fuji Velvia 50 · 65%" for LUT layers. */
const summary = (slice: LayerRowSlice, layer: Layer, ui: (typeof LAYER_UI)[LayerType]) =>
  layer.type === 'colorMixer'
    ? mixerSummary(slice, layer)
    : layer.type === 'lut'
      ? `${lutName(slice.catalog, layer.lutId)} · ${ui.formatValue(layer)}`
      : ui.formatValue(layer)

/** The active hue range of a Color Mixer layer's drawer (0..7). */
const activeMixerColorFor = (slice: LayerRowSlice, layerId: LayerId) =>
  Math.min(7, Math.max(0, Math.round(slice.activeMixerColor[layerId] ?? 0)))

/**
 * One-line drawer summary for a Color Mixer layer: the active range's name
 * plus its non-default slider values (the same numbers the open sliders
 * show). A pristine layer reads just "Red".
 */
const mixerSummary = (slice: LayerRowSlice, layer: Layer) => {
  const color = MIXER_COLORS[activeMixerColorFor(slice, layer.id)]!
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
 * The 8 hue-range swatches (docs/adr/0003-adjustment-layers D3): pure-hue dots at the same
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
      button(
        {
          onClick: onSelect(index),
          size: 'icon-xs',
          variant: 'ghost',
          className: `size-5 shrink-0 rounded-full border p-0 ${
            index === active ? 'border-ink ring-1 ring-ink' : 'border-border hover:border-muted'
          }`,
          attributes: [
            h.AriaLabel(`Select ${color.name}`),
            h.AriaPressed(String(index === active)),
            h.Style({ background: `hsl(${color.hue} 100% 50%)` }),
          ],
        },
        [],
        h,
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
  slice: LayerRowSlice,
  layer: Layer,
  ui: (typeof LAYER_UI)[LayerType],
  kind: 'draft' | 'chain',
) => {
  if (layer.type === 'colorMixer') {
    const color = activeMixerColorFor(slice, layer.id)
    return [
      mixerSwatches(h, color, (index) =>
        EditorMessage.SelectedMixerColor({ color: index, id: layer.id }),
      ),
      ...mixerSliders(h, layer, ui, color, (field, value) =>
        kind === 'draft'
          ? EditorMessage.UpdatedDraftParam({ field, value })
          : EditorMessage.UpdatedLayerParam({ field, id: layer.id, value }),
      ),
    ]
  }
  if (layer.type === 'toneCurve') {
    return [toneCurveWidget(h, layer)]
  }
  return Object.keys(ui.fields).map((field) =>
    kind === 'draft'
      ? draftSlider(h, layer, FieldKey(field), ui)
      : chainSlider(h, layer, FieldKey(field), ui, slice),
  )
}

// memoization (ADR 0006)
const lazyDraft = createLazy()
const lazyRow = createKeyedLazy()

const draftView = (
  layer: Layer,
  lutBarOpen: boolean,
  catalog: Model['catalog'],
  activeField: number | undefined,
  activeMixer: number | undefined,
  h: HtmlBuilder<EditorMessage>,
): Html => {
  const slice: LayerRowSlice = {
    catalog,
    lutBarOpen,
    activeFieldIndex: activeField !== undefined ? { [layer.id]: activeField } : {},
    activeMixerColor: activeMixer !== undefined ? { [layer.id]: activeMixer } : {},
  }
  return draftRow(h, slice, layer)
}

const chainRowView = (
  layer: Layer,
  index: number,
  total: number,
  selected: boolean,
  lutBarOpen: boolean,
  catalog: Model['catalog'],
  activeField: number | undefined,
  activeMixer: number | undefined,
  h: HtmlBuilder<EditorMessage>,
): Html =>
  chainRowImpl(h, layer, index, total, selected, lutBarOpen, catalog, activeField, activeMixer)

/**
 * The right "Layers" sidebar (docs/adr/0010-editor-ui.md): always visible as a side
 * column at `lg`+, and a full-width bottom sheet below `lg` — `open` is the
 * mobile sheet state (visible only while its tab is active).
 */
export const layerDrawer = (
  h: HtmlBuilder<EditorMessage>,
  slice: LayerDrawerSlice,
  open: boolean,
) =>
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
          h.span([h.Class('tnum text-muted')], [String(slice.chain.length)]),
        ],
      ),
      h.div(
        [h.Class('flex flex-col overflow-y-auto')],
        [
          ...(slice.phase._tag === 'Drafting'
            ? [
                lazyDraft(draftView, [
                  slice.phase.layer,
                  slice.lutBarOpen,
                  slice.catalog,
                  slice.activeFieldIndex[slice.phase.layer.id],
                  slice.activeMixerColor[slice.phase.layer.id],
                  h,
                ]),
              ]
            : []),
          ...slice.chain
            .map((layer, index) => {
              const selected = slice.phase._tag === 'Selected' && slice.phase.layerId === layer.id
              return lazyRow(layer.id, chainRowView, [
                layer,
                index,
                slice.chain.length,
                selected,
                slice.lutBarOpen,
                slice.catalog,
                slice.activeFieldIndex[layer.id],
                slice.activeMixerColor[layer.id],
                h,
              ])!
            })
            .reverse(),
          ...(slice.chain.length === 0 && slice.phase._tag !== 'Drafting' ? [emptyState(h)] : []),
        ],
      ),
    ],
  )

const emptyState = (h: HtmlBuilder<EditorMessage>) =>
  h.div(
    [h.Class('px-4 py-10 text-center text-xs text-muted')],
    ['No adjustments yet. Pick one from the left.'],
  )

const draftRow = (h: HtmlBuilder<EditorMessage>, slice: LayerRowSlice, layer: Layer) => {
  const ui = LAYER_UI[layer.type]
  return h.div(
    [h.Class('border-b border-border bg-panel-alt'), h.AriaLabel(`${ui.label} draft`)],
    [
      h.div(
        [h.Class('flex items-center gap-2 px-4 py-2')],
        [
          icon(h, ui.icon, ui.label),
          h.span([h.Class('min-w-0 flex-1 truncate text-sm font-medium')], [ui.label]),
          ...(layer.type === 'lut' ? [lutBarToggleImpl(h, slice.lutBarOpen)] : []),
        ],
      ),
      h.div(
        [h.Class('flex flex-col gap-3 px-4 pb-3')],
        [...layerSliders(h, slice, layer, ui, 'draft')],
      ),
      h.div(
        [h.Class('flex items-center justify-end gap-2 px-4 py-2')],
        [
          button(
            {
              onClick: EditorMessage.CancelledDraft(),
              variant: 'ghost',
              size: 'icon-sm',
              className: 'grid place-items-center',
              attributes: [h.AriaLabel('Cancel draft')],
            },
            [icon(h, X, 'Cancel draft')],
            h,
          ),
          button(
            {
              onClick: EditorMessage.ConfirmedDraft(),
              size: 'icon-sm',
              className: 'grid place-items-center',
              attributes: [h.AriaLabel('Confirm draft')],
            },
            [icon(h, Check, 'Confirm draft')],
            h,
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
    EditorMessage.UpdatedDraftParam({ field, value: v }),
  )
}

const chainRowImpl = (
  h: HtmlBuilder<EditorMessage>,
  layer: Layer,
  index: number,
  total: number,
  selected: boolean,
  lutBarOpen: boolean,
  catalog: Model['catalog'],
  activeField: number | undefined,
  activeMixer: number | undefined,
) => {
  const ui = LAYER_UI[layer.type]
  const rowSlice: LayerRowSlice = {
    catalog,
    lutBarOpen,
    activeFieldIndex: activeField !== undefined ? { [layer.id]: activeField } : {},
    activeMixerColor: activeMixer !== undefined ? { [layer.id]: activeMixer } : {},
  }
  return h.div(
    [
      h.Key(layer.id),
      h.Class(`border-b border-border ${selected ? 'bg-panel-alt' : ''}`),
      h.DataAttribute('layer-id', layer.id),
    ],
    [
      h.div(
        [
          h.Class('flex items-center gap-2 px-4 py-2'),
          h.OnClick(EditorMessage.SelectedLayer({ id: layer.id })),
        ],
        [
          button(
            {
              onClick: EditorMessage.ToggledLayerVisibility({ id: layer.id }),
              variant: 'ghost',
              size: 'icon-sm',
              className: 'grid place-items-center',
              attributes: [h.AriaLabel(layer.visible ? 'Hide layer' : 'Show layer')],
            },
            [icon(h, layer.visible ? Eye : EyeOff, layer.visible ? 'Hide' : 'Show')],
            h,
          ),
          icon(h, ui.icon, ui.label),
          h.span([h.Class('min-w-0 flex-1 truncate text-sm')], [ui.label]),
          h.span(
            [h.Class('tnum min-w-0 truncate text-xs text-muted')],
            [summary(rowSlice, layer, ui)],
          ),
          h.div(
            [h.Class('flex items-center gap-0.5')],
            [
              ...(layer.type === 'lut' ? [lutBarToggleImpl(h, lutBarOpen)] : []),
              reorderButton(h, 'Move up', ArrowUp, index === total - 1, () =>
                EditorMessage.ReorderedLayer({ from: index, to: index + 1 }),
              ),
              reorderButton(h, 'Move down', ArrowDown, index === 0, () =>
                EditorMessage.ReorderedLayer({ from: index, to: index - 1 }),
              ),
              button(
                {
                  onClick: EditorMessage.RemovedLayer({ id: layer.id }),
                  variant: 'ghost',
                  size: 'icon-sm',
                  className: 'grid place-items-center',
                  attributes: [h.AriaLabel('Delete layer')],
                },
                [icon(h, Trash2, 'Delete layer')],
                h,
              ),
            ],
          ),
        ],
      ),
      selected
        ? h.div(
            [h.Class('flex flex-col gap-3 px-4 pb-4')],
            [...(() => layerSliders(h, rowSlice, layer, ui, 'chain'))()],
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
  slice: LayerRowSlice,
) => {
  const fieldUi = ui.fields[field]!
  const { min, max } = fieldBounds(layer.type, field)
  const value = num(layer, field)
  if (ui.toggled) {
    const keys = Object.keys(ui.fields)
    const activeIndex = slice.activeFieldIndex[layer.id] ?? 0
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
      (v) => EditorMessage.UpdatedLayerParam({ field, id: layer.id, value: v }),
      ui.toggled,
      () => EditorMessage.CycledToggledField({ id: layer.id }),
    )
  }
  return sliderControl(h, fieldUi.label, fieldUi.format(value), min, max, value, (v) =>
    EditorMessage.UpdatedLayerParam({ field, id: layer.id, value: v }),
  )
}

const reorderButton = (
  h: HtmlBuilder<EditorMessage>,
  label: string,
  node: Parameters<typeof icon>[1],
  disabled: boolean,
  onClick: () => EditorMessage,
) =>
  button(
    {
      onClick: onClick(),
      isDisabled: disabled,
      variant: 'ghost',
      size: 'icon-sm',
      className: 'grid place-items-center disabled:opacity-30',
      attributes: [h.AriaLabel(label)],
    },
    [icon(h, node, label)],
    h,
  )

/** The chevron on a drawer LUT row: expands/collapses the bottom LUT bar */
const lutBarToggleImpl = (h: HtmlBuilder<EditorMessage>, open: boolean) =>
  button(
    {
      onClick: EditorMessage.ToggledLutPicker(),
      variant: 'ghost',
      size: 'icon-sm',
      className: 'grid place-items-center',
      attributes: [h.AriaExpanded(open), h.AriaLabel('Toggle LUT bar')],
    },
    [icon(h, open ? ChevronUp : ChevronDown, 'Toggle LUT bar')],
    h,
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
      lutraRangeRow(h, {
        label: toggledLabel ? `⇅ ${label}` : label,
        display,
        min,
        max,
        step: 0.01,
        value,
        onInput: onChange,
        ...(toggledLabel && onToggleLabel ? { labelOnClick: onToggleLabel } : {}),
      }),
    ],
  )
