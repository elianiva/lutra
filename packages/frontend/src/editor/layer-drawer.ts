import { Option, pipe } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  X,
} from 'lucide'
import type { IconNode } from 'lucide'
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
import { lutSheet } from './lut-bar'
import { lutTarget } from './lut-bar/target'
import { FieldKey, numField } from '@lutra/engine'
import type { Layer, LayerId, LayerType } from '@lutra/engine'

type LayerRowSlice = Pick<Model, 'catalog' | 'activeFieldIndex' | 'activeMixerColor'>

export type InspectorSlice = Pick<
  Model,
  | 'chain'
  | 'phase'
  | 'catalog'
  | 'activeFieldIndex'
  | 'activeMixerColor'
  | 'previewLut'
  | 'lutTab'
  | 'lutRecents'
  | 'lutThumbs'
  | 'lutDownloads'
  | 'online'
  | 'offlineLutNotice'
>

const num = (layer: Layer, key: FieldKey): number => numField(layer, key)

const activeMixerColorFor = (slice: LayerRowSlice, layerId: LayerId) =>
  Math.min(7, Math.max(0, Math.round(slice.activeMixerColor[layerId] ?? 0)))

/** One-line readout for the header: the layer's formatted value. */
const headerValue = (slice: LayerRowSlice, layer: Layer, ui: (typeof LAYER_UI)[LayerType]) =>
  layer.type === 'colorMixer' ? mixerSummary(slice, layer) : ui.formatValue(layer)

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

const mixerSwatches = (
  h: HtmlBuilder<EditorMessage>,
  active: number,
  onSelect: (index: number) => EditorMessage,
) =>
  h.div(
    [h.Class('flex items-center gap-2'), h.AriaLabel('Color ranges')],
    MIXER_COLORS.map((color, index) =>
      button(
        {
          onClick: onSelect(index),
          size: 'icon-xs',
          variant: 'ghost',
          className: `size-5 shrink-0 rounded-full p-0 ${
            index === active ? 'ring-2 ring-ink' : 'ring-1 ring-transparent hover:ring-dim'
          }`,
          attributes: [
            h.AriaLabel(`Select ${color.name}`),
            h.AriaPressed(String(index === active)),
            h.Style({ background: `hsl(${String(color.hue)} 100% 50%)` }),
          ],
        },
        [],
        h,
      ),
    ),
  )

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
  return Object.keys(ui.fields).map((field) => {
    const key = FieldKey(field)
    return kind === 'draft' ? draftSlider(h, layer, key, ui) : chainSlider(h, slice, layer, key, ui)
  })
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

const chainSlider = (
  h: HtmlBuilder<EditorMessage>,
  slice: LayerRowSlice,
  layer: Layer,
  field: FieldKey,
  ui: (typeof LAYER_UI)[LayerType],
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
) => {
  const rangeConfig = {
    label: toggledLabel ? `⇅ ${label}` : label,
    display,
    min,
    max,
    step: 0.01,
    value,
    onInput: onChange,
  }
  const finalConfig =
    toggledLabel && onToggleLabel ? { ...rangeConfig, labelOnClick: onToggleLabel } : rangeConfig
  return h.div([h.Class('flex flex-col gap-1')], [lutraRangeRow(h, finalConfig)])
}

type Panel =
  | Readonly<{ kind: 'draft'; layer: Layer }>
  | Readonly<{ kind: 'chain'; layer: Layer; index: number }>
  | Readonly<{ kind: 'empty' }>

const panelOf = (slice: InspectorSlice): Panel => {
  if (slice.phase._tag === 'Drafting') {
    return { kind: 'draft', layer: slice.phase.layer }
  }
  if (slice.phase._tag === 'Selected') {
    const layerId = slice.phase.layerId
    const index = slice.chain.findIndex((layer) => layer.id === layerId)
    const layer = index < 0 ? undefined : slice.chain[index]
    return layer === undefined ? { kind: 'empty' } : { kind: 'chain', index, layer }
  }
  return { kind: 'empty' }
}

/**
 * The inspector (docs/adr/0013-materials): a floating panel that shows the
 * selected layer's parameters — never the chain. The chain is the dock; the
 * inspector edits.
 *
 * A draft has the same shape as a committed layer, with Cancel / Apply in the
 * footer instead of the layer actions, so the transaction stays visible.
 */
export const layerDrawer = (
  h: HtmlBuilder<EditorMessage>,
  slice: InspectorSlice,
  open: boolean,
) => {
  const panel = panelOf(slice)
  const rowSlice: LayerRowSlice = {
    catalog: slice.catalog,
    activeFieldIndex: slice.activeFieldIndex,
    activeMixerColor: slice.activeMixerColor,
  }
  return h.aside(
    [
      h.Class(
        `${open ? 'flex' : 'hidden'} absolute inset-x-0 bottom-[64px] z-30 max-h-[70dvh] w-full flex-col overflow-y-auto rounded-t-[18px] bg-s1 shadow-[0_-24px_48px_-20px_var(--mat-shadow-a)] lg:static lg:z-auto lg:max-h-[calc(100dvh-104px)] lg:w-[328px] lg:flex-none lg:overflow-y-auto lg:rounded-none lg:bg-transparent lg:shadow-none`,
      ),
      h.AriaLabel('Selected adjustment'),
    ],
    [
      h.div(
        [
          h.Class(
            'surface flex w-full flex-col overflow-hidden rounded-t-[18px] lg:mt-3 lg:rounded-[18px]',
          ),
          h.AriaLabel(
            panel.kind === 'empty'
              ? 'Adjustment inspector'
              : `${LAYER_UI[panel.layer.type].label} ${panel.kind === 'draft' ? 'draft' : 'layer'}`,
          ),
        ],
        [
          panel.kind === 'empty' ? emptyPanel(h) : parameterPanel(h, slice, rowSlice, panel),
          panelFooter(h, panel),
        ],
      ),
    ],
  )
}

const parameterPanel = (
  h: HtmlBuilder<EditorMessage>,
  slice: InspectorSlice,
  rowSlice: LayerRowSlice,
  panel: Exclude<Panel, { kind: 'empty' }>,
): Html => {
  const { layer } = panel
  const ui = LAYER_UI[layer.type]
  const stepper = stepperConfig(panel)
  return h.div(
    [h.Class('flex flex-col')],
    [
      h.div(
        [h.Class('flex flex-col gap-2 px-4 pb-3 pt-4')],
        [
          h.div(
            [h.Class('flex items-baseline justify-between gap-2')],
            [
              h.span(
                [h.Class('label')],
                [
                  panel.kind === 'draft'
                    ? 'Draft'
                    : `Module ${String(panel.index + 1).padStart(2, '0')}`,
                ],
              ),
              h.span(
                [h.Class('label')],
                [panel.kind === 'draft' ? 'Confirm to add' : layer.visible ? 'Enabled' : 'Hidden'],
              ),
            ],
          ),
          h.div(
            [h.Class('flex items-center gap-3')],
            [
              h.span([h.Class('text-ink')], [icon(h, ui.icon, ui.label)]),
              h.span([h.Class('text-base')], [ui.label]),
              h.span(
                [h.Class('tnum ml-auto font-mono text-xl leading-none')],
                [headerValue(rowSlice, layer, ui)],
              ),
              ...(stepper === null
                ? []
                : [
                    h.div(
                      [h.Class('flex gap-1')],
                      [
                        stepperButton(h, 'Increase', ChevronUp, stepper(1)),
                        stepperButton(h, 'Decrease', ChevronDown, stepper(-1)),
                      ],
                    ),
                  ]),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('flex flex-col gap-3 px-4 pb-4')],
        [...layerSliders(h, rowSlice, layer, ui, panel.kind === 'draft' ? 'draft' : 'chain')],
      ),
      ...(panel.kind === 'chain' ? [positionRow(h, slice, panel.index)] : []),
      ...context(h, slice, layer, ui),
    ],
  )
}

/** The stepper only exists for layers with exactly one plain numeric field. */
const stepperConfig = (panel: Exclude<Panel, { kind: 'empty' }>) => {
  const ui = LAYER_UI[panel.layer.type]
  const keys = Object.keys(ui.fields)
  if (ui.toggled || keys.length !== 1 || keys[0] === undefined) {
    return null
  }
  const field = FieldKey(keys[0])
  const { min, max } = fieldBounds(panel.layer.type, field)
  const step = (max - min) / 100
  const current = num(panel.layer, field)
  return (direction: 1 | -1): EditorMessage => {
    const value = current + direction * step
    return panel.kind === 'draft'
      ? EditorMessage.UpdatedDraftParam({ field, value })
      : EditorMessage.UpdatedLayerParam({ field, id: panel.layer.id, value })
  }
}

const stepperButton = (
  h: HtmlBuilder<EditorMessage>,
  label: string,
  Icon: IconNode,
  onClick: EditorMessage,
) =>
  button(
    {
      onClick,
      variant: 'ghost',
      size: 'icon-xs',
      className:
        'grid size-[26px] place-items-center rounded-[8px] bg-s2 text-dim hover:bg-s3 hover:text-ink',
      attributes: [h.AriaLabel(label)],
    },
    [icon(h, Icon, label, 14)],
    h,
  )

/** Where the layer sits in the chain, and the two moves that change it. */
const positionRow = (h: HtmlBuilder<EditorMessage>, slice: InspectorSlice, index: number): Html => {
  const total = slice.chain.length
  return h.div(
    [h.Class('flex items-center justify-between gap-2 px-4 pb-4')],
    [
      moveButton(h, 'Move up', ArrowUp, index === 0, () =>
        EditorMessage.ReorderedLayer({ from: index, to: index - 1 }),
      ),
      h.span([h.Class('micro tnum')], [`Position ${String(index + 1)} of ${String(total)}`]),
      moveButton(h, 'Move down', ArrowDown, index === total - 1, () =>
        EditorMessage.ReorderedLayer({ from: index, to: index + 1 }),
      ),
    ],
  )
}

const moveButton = (
  h: HtmlBuilder<EditorMessage>,
  label: string,
  Icon: IconNode,
  disabled: boolean,
  onClick: () => EditorMessage,
) =>
  button(
    {
      onClick: onClick(),
      isDisabled: disabled,
      variant: 'ghost',
      size: 'icon-xs',
      className:
        'grid size-7 place-items-center rounded-[8px] bg-s2 text-dim hover:bg-s3 hover:text-ink disabled:opacity-30',
      attributes: [h.AriaLabel(label)],
    },
    [icon(h, Icon, label, 13)],
    h,
  )

const context = (
  h: HtmlBuilder<EditorMessage>,
  slice: InspectorSlice,
  layer: Layer,
  ui: (typeof LAYER_UI)[LayerType],
): readonly Html[] => {
  if (layer.type === 'lut') {
    const target = pipe(
      lutTarget(slice.phase, slice.chain),
      Option.map((t): 'draft' | 'layer' => (t.kind === 'draft' ? 'draft' : 'layer')),
      Option.getOrElse((): 'draft' | 'layer' => 'draft'),
    )
    const commitTarget =
      target === 'draft' ? ({ kind: 'draft' } as const) : ({ kind: 'layer', id: layer.id } as const)
    return [
      h.div(
        [
          h.Class(
            'well mx-3 mb-3 flex max-h-[min(440px,calc(100dvh-420px))] flex-col gap-3 overflow-y-auto p-3 [mask-image:linear-gradient(to_bottom,#000_96%,transparent)]',
          ),
        ],
        [
          h.div(
            [h.Class('flex items-baseline justify-between gap-3 text-[10px]')],
            [
              h.span([h.Class('label')], ['Stock']),
              h.span([h.Class('truncate text-ink')], [lutName(slice.catalog, layer.lutId)]),
            ],
          ),
          h.div(
            [h.Class('flex items-baseline justify-between gap-3 text-[10px]')],
            [
              h.span([h.Class('label')], ['Space']),
              h.span([h.Class('tnum font-mono text-ink')], ['sRGB · 13³']),
            ],
          ),
          lutSheet(h, slice, commitTarget, Option.some(layer.lutId)),
        ],
      ),
    ]
  }
  return [
    h.div(
      [h.Class('well mx-3 mb-3 flex flex-col gap-2 p-3')],
      [
        h.p([h.Class('text-[11px] leading-snug text-muted')], [ui.description]),
        h.p([h.Class('text-[10px] leading-snug text-dim')], [ui.when]),
      ],
    ),
  ]
}

const panelFooter = (h: HtmlBuilder<EditorMessage>, panel: Panel): Html => {
  if (panel.kind === 'empty') {
    return null
  }
  if (panel.kind === 'draft') {
    return h.div(
      [h.Class('flex gap-1.5 px-3 pb-3')],
      [
        footerButton(h, 'Cancel draft', X, EditorMessage.CancelledDraft(), false, 'Cancel'),
        footerButton(h, 'Apply adjustment', Check, EditorMessage.ConfirmedDraft(), true, 'Apply'),
      ],
    )
  }
  return h.div(
    [h.Class('flex gap-1.5 px-3 pb-3')],
    [
      footerButton(
        h,
        panel.layer.visible ? 'Hide layer' : 'Show layer',
        panel.layer.visible ? Eye : EyeOff,
        EditorMessage.ToggledLayerVisibility({ id: panel.layer.id }),
        false,
        null,
      ),
      footerButton(
        h,
        'Delete layer',
        Trash2,
        EditorMessage.RemovedLayer({ id: panel.layer.id }),
        false,
        null,
      ),
      footerButton(h, 'Add adjustment', Plus, EditorMessage.ToggledPalette(), false, null),
    ],
  )
}

const footerButton = (
  h: HtmlBuilder<EditorMessage>,
  label: string,
  Icon: IconNode,
  message: EditorMessage,
  primary: boolean,
  text: string | null,
) =>
  h.button(
    [
      h.Class(
        `flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] text-[10px] uppercase tracking-[0.1em] transition-colors ${
          primary ? 'key bg-accent text-accent-ink' : 'bg-s2 text-dim hover:bg-s3 hover:text-ink'
        }`,
      ),
      h.OnClick(message),
      h.AriaLabel(label),
      h.Title(label),
    ],
    text === null ? [icon(h, Icon, label, 16)] : [icon(h, Icon, label, 14), text],
  )

const emptyPanel = (h: HtmlBuilder<EditorMessage>) =>
  h.div(
    [h.Class('flex flex-col items-start gap-4 p-4')],
    [
      h.div(
        [h.Class('flex w-full items-baseline justify-between gap-2')],
        [h.span([h.Class('label')], ['Inspector']), h.span([h.Class('label')], ['No selection'])],
      ),
      h.p(
        [h.Class('text-xs leading-relaxed text-muted')],
        ['Pick an adjustment from the rail, or search all thirteen in the palette.'],
      ),
      h.button(
        [
          h.Class(
            'flex h-8 items-center gap-2 rounded-full bg-s2 px-3 text-[10px] uppercase tracking-[0.1em] text-ink hover:bg-s3',
          ),
          h.OnClick(EditorMessage.ToggledPalette()),
          h.AriaLabel('Add adjustment'),
        ],
        ['Add adjustment'],
      ),
    ],
  )
