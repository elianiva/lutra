import type { HtmlBuilder } from 'foldkit/html'
import { icon } from '../components/icon'
import { LAYER_UI, LAYER_TYPES_ORDER } from './layer-meta'
import { SelectedTool } from '../app/message'
import type { AppMessage } from '../app/message'
import type { Model } from '../app/model'
import type { LayerType } from '@lutra/engine'

/** Left sidebar: all 11 adjustment types as a vertical icon+label list. */
export const toolPanel = (h: HtmlBuilder<AppMessage>, model: Model) =>
  h.aside(
    [
      h.Class('flex w-60 shrink-0 flex-col border-r border-border bg-panel'),
      h.AriaLabel('Adjustment tools'),
    ],
    [
      h.div(
        [
          h.Class(
            'border-b border-border px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-muted',
          ),
        ],
        ['Adjustments'],
      ),
      h.nav(
        [h.Class('flex flex-col')],
        LAYER_TYPES_ORDER.map((type) =>
          toolRow(h, type, model.draft !== null, model.catalog !== null),
        ),
      ),
    ],
  )

const toolRow = (
  h: HtmlBuilder<AppMessage>,
  type: LayerType,
  draftActive: boolean,
  lutEnabled: boolean,
) => {
  const ui = LAYER_UI[type]
  // The LUT tool needs the catalog: a draft must reference a real lutId.
  const disabled = draftActive || (type === 'lut' && !lutEnabled)
  return h.button(
    [
      h.OnClick(SelectedTool({ type })),
      h.Disabled(disabled),
      h.AriaLabel(`Add ${ui.label} adjustment`),
      h.Class(
        'flex items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-40',
      ),
    ],
    [
      icon(h, ui.icon, ui.label),
      h.span([h.Class('text-sm')], [ui.label]),
    ],
  )
}