import type { HtmlBuilder } from 'foldkit/html'
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2, X, Check } from 'lucide'
import { icon } from '../components/icon'
import { LAYER_UI, fieldBounds, lutName } from './layer-meta'
import { lutPicker } from './lut-picker'
import {
  SelectedLayer,
  RemovedLayer,
  ToggledLayerVisibility,
  UpdatedLayerParam,
  UpdatedDraftParam,
  ChangedDraftLut,
  ChangedLayerLut,
  ConfirmedDraft,
  CancelledDraft,
  CycledToggledField,
  ReorderedLayer,
} from '../app/message'
import type { AppMessage } from '../app/message'
import type { Model } from '../app/model'
import { FieldKey, type Layer, type LayerType } from '@lutra/engine'

const num = (layer: Layer, key: FieldKey): number => {
  const record: Record<string, unknown> = layer
  const value = record[key]
  return typeof value === 'number' ? value : NaN
}

/** One-line drawer summary: "Fuji Velvia 50 · 65%" for LUT layers. */
const summary = (model: Model, layer: Layer, ui: (typeof LAYER_UI)[LayerType]): string =>
  layer.type === 'lut'
    ? `${lutName(model.catalog, layer.lutId)} · ${ui.formatValue(layer)}`
    : ui.formatValue(layer)

/** Right sidebar: the edit chain as a vertical list with inline sliders. */
export const layerDrawer = (h: HtmlBuilder<AppMessage>, model: Model) =>
  h.aside(
    [h.Class('flex w-72 shrink-0 flex-col border-l border-border bg-panel'), h.AriaLabel('Layers')],
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
          ...model.chain.map((layer, index) => chainRow(h, model, layer, index)).reverse(),
          ...(model.chain.length === 0 && model.phase._tag !== 'Drafting' ? [emptyState(h)] : []),
        ],
      ),
    ],
  )

// The chain renders bottom-up (newest at the top, like Lightroom's history) so
// the most recent adjustment sits at eye level.

const emptyState = (h: HtmlBuilder<AppMessage>) =>
  h.div(
    [h.Class('px-4 py-10 text-center text-xs text-muted')],
    ['No adjustments yet. Pick one from the left.'],
  )

const draftRow = (h: HtmlBuilder<AppMessage>, model: Model, layer: Layer) => {
  const ui = LAYER_UI[layer.type]
  return h.div(
    [h.Class('border-b border-border bg-panel-alt'), h.AriaLabel(`${ui.label} draft`)],
    [
      h.div(
        [h.Class('flex items-center gap-2 px-4 py-2')],
        [icon(h, ui.icon, ui.label), h.span([h.Class('text-sm font-medium')], [ui.label])],
      ),
      h.div(
        [h.Class('flex flex-col gap-3 px-4 pb-3')],
        [
          ...(layer.type === 'lut'
            ? [lutPicker(h, model, layer.lutId, (lutId) => ChangedDraftLut({ lutId }))]
            : []),
          ...Object.keys(ui.fields).map((field) => draftSlider(h, layer, FieldKey(field), ui)),
        ],
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
  h: HtmlBuilder<AppMessage>,
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

const chainRow = (h: HtmlBuilder<AppMessage>, model: Model, layer: Layer, index: number) => {
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
          h.span([h.Class('tnum text-xs text-muted')], [summary(model, layer, ui)]),
          h.div(
            [h.Class('flex items-center gap-0.5')],
            [
              // The chain renders bottom-up (newest at the top), so "Move up"
              // targets a higher chain index and "Move down" a lower one. A row
              // at the top of the stack can't move up; a row at the bottom can't
              // move down.
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
            [
              ...(layer.type === 'lut'
                ? [
                    lutPicker(h, model, layer.lutId, (lutId) =>
                      ChangedLayerLut({ id: layer.id, lutId }),
                    ),
                  ]
                : []),
              ...Object.keys(ui.fields).map((field) =>
                chainSlider(h, layer, FieldKey(field), ui, model),
              ),
            ],
          )
        : null,
    ],
  )
}

const chainSlider = (
  h: HtmlBuilder<AppMessage>,
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
    if (keys[activeIndex] !== field) return null
    return sliderControl(
      h,
      fieldUi.label,
      fieldUi.format(value),
      min,
      max,
      value,
      (v) => UpdatedLayerParam({ id: layer.id, field, value: v }),
      ui.toggled,
      () => CycledToggledField({ id: layer.id }),
    )
  }
  return sliderControl(h, fieldUi.label, fieldUi.format(value), min, max, value, (v) =>
    UpdatedLayerParam({ id: layer.id, field, value: v }),
  )
}

const reorderButton = (
  h: HtmlBuilder<AppMessage>,
  label: string,
  node: Parameters<typeof icon>[1],
  disabled: boolean,
  onClick: () => AppMessage,
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

/** One labelled slider row: label, numeric readout, range input. */
export const sliderControl = (
  h: HtmlBuilder<AppMessage>,
  label: string,
  display: string,
  min: number,
  max: number,
  value: number,
  onChange: (v: number) => AppMessage,
  toggledLabel = false,
  onToggleLabel?: () => AppMessage,
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
