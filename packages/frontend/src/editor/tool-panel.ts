import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { icon } from '../components/icon'
import { LAYER_UI, LAYER_TYPES_ORDER } from './layer-meta'
import { SelectedTool } from './message'
import type { EditorMessage } from './message'
import type { Model } from './model'
import type { EditorPhase } from './phase'
import type { LayerType } from '@lutra/engine'

/**
 * The left "Adjustments" panel: one card per tool (docs/adr/0016-tool-panel-cards). A card
 * is icon + title on one line, an always-visible two-line description
 * ("what it does" / "when to use it") below, and a muted ×N badge when the
 * tool is already in the chain. The LUT card's description slot doubles as
 * the catalog status slot (loading / failed) while the library isn't
 * available — plan 06's caption absorbed into the card.
 *
 * `open` is the mobile sheet state (docs/adr/0024-mobile-ui): under `lg` the panel
 * renders as a full-width bottom sheet, visible only while its tab is
 * active; the classes flip back to the in-flow side column at `lg`.
 */
const lazyCard = createKeyedLazy()

const toolCardView = (
  type: LayerType,
  count: number,
  editable: boolean,
  lutEnabled: boolean,
  catalogError: Model['catalogError'],
  h: HtmlBuilder<EditorMessage>,
): Html => toolCardInner(h, type, count, editable, lutEnabled, catalogError)

export const toolPanel = (h: HtmlBuilder<EditorMessage>, model: Model, open: boolean) => {
  const editable = canPickTool(model.phase)
  const lutEnabled = model.catalog !== null
  return h.aside(
    [
      h.Class(
        `${open ? 'flex' : 'hidden'} order-3 max-h-[45dvh] shrink-0 flex-col overflow-y-auto border-t border-border bg-panel lg:order-none lg:flex lg:max-h-none lg:w-72 lg:overflow-y-visible lg:border-r lg:border-t-0`,
      ),
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
        [h.Class('flex min-h-0 flex-1 flex-col overflow-y-auto')],
        LAYER_TYPES_ORDER.map((type) =>
          lazyCard(type, toolCardView, [
            type,
            chainCount(model, type),
            editable,
            lutEnabled,
            model.catalogError,
            h,
          ]),
        ),
      ),
    ],
  )
}

/** The machine owns the real gate (no SelectedTool edge from Empty/Loading/
 *  Error/Drafting — see ./phase.ts); this mirrors it so the buttons read
 *  as disabled instead of dead. */
const canPickTool = (phase: EditorPhase) => phase._tag === 'Idle' || phase._tag === 'Selected'

/** How many committed chain layers of this type are in the edit — the
 *  card's "in your edit" badge (docs/adr/0016-tool-panel-cards D4). */
export const chainCount = (model: Model, type: LayerType): number =>
  model.chain.filter((layer) => layer.type === type).length

const toolCardInner = (
  h: HtmlBuilder<EditorMessage>,
  type: LayerType,
  count: number,
  editable: boolean,
  lutEnabled: boolean,
  catalogError: Model['catalogError'],
) => {
  const ui = LAYER_UI[type]
  const disabled = !editable || (type === 'lut' && !lutEnabled)
  const catalogStatus =
    type === 'lut' && !lutEnabled
      ? catalogError === null
        ? 'Loading LUTs…'
        : 'LUTs unavailable'
      : null
  return h.button(
    [
      h.Key(type),
      h.OnClick(SelectedTool({ type })),
      h.Disabled(disabled),
      ...(catalogStatus !== null && catalogError !== null ? [h.Title(catalogError.message)] : []),
      h.AriaLabel(`Add ${ui.label} adjustment`),
      h.Class(
        'flex flex-col gap-1.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-40',
      ),
    ],
    [
      h.div(
        [h.Class('flex items-center gap-3')],
        [
          icon(h, ui.icon, ui.label),
          h.span([h.Class('text-sm font-medium')], [ui.label]),
          // "Already in your edit": a muted ×N pill, right-aligned on the
          // title line. Only when the tool is in the chain — a first-time
          // user sees nothing (docs/adr/0016-tool-panel-cards D4).
          ...(count > 0
            ? [
                h.span(
                  [
                    h.AriaLabel(`In your edit: ${count}`),
                    h.Attribute('data-testid', 'in-edit-badge'),
                    h.Class(
                      'ml-auto shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[10px] leading-none text-muted',
                    ),
                  ],
                  [`×${count}`],
                ),
              ]
            : []),
        ],
      ),
      h.div(
        [h.Class('text-xs leading-4 text-muted')],
        catalogStatus === null
          ? [h.span([h.Class('block')], [ui.description]), h.span([h.Class('block')], [ui.when])]
          : [catalogStatus],
      ),
    ],
  )
}
