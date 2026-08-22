import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { icon } from '../components/icon'
import { LAYER_UI, LAYER_TYPES_ORDER } from './layer-meta'
import { HoveredToolChanged, SelectedTool } from './message'
import type { EditorMessage } from './message'
import type { Model } from './model'
import type { EditorPhase } from './phase'
import type { LayerType } from '@lutra/engine'

/**
 * The left "Adjustments" panel: a Photoshop-style **icon rail** on desktop
 * (docs/adr/0016-tool-panel-cards D3, superseded 2026-08-23) — one icon-only
 * button per tool; hovering (or keyboard-focusing) a card shows a custom
 * tooltip panel carrying the tool's copy ("what it does" / "when to use
 * it"). The open card is the model's `hoveredTool` field — no submodel, no
 * native `title`; the panel renders straight from the view. Below `lg` the
 * panel is still the full-width mobile bottom sheet (docs/adr/0024-mobile-
 * ui), where hover doesn't exist — there each button keeps its label +
 * visible two-line description and the tooltip panel is display:none. A
 * muted ×N badge pins to the button's top-right corner when the tool is
 * already in the chain. The LUT card's tooltip doubles as the catalog status
 * slot (loading / failed) while the library isn't available.
 *
 * `open` is the mobile sheet state: under `lg` the panel renders as a
 * full-width bottom sheet, visible only while its tab is active; the classes
 * flip back to the in-flow side column at `lg`.
 */
const lazyCard = createKeyedLazy()

const toolCardView = (
  type: LayerType,
  count: number,
  editable: boolean,
  lutEnabled: boolean,
  catalogError: Model['catalogError'],
  hoveredTool: Model['hoveredTool'],
  h: HtmlBuilder<EditorMessage>,
): Html => toolCardInner(h, type, count, editable, lutEnabled, catalogError, hoveredTool)

export const toolPanel = (h: HtmlBuilder<EditorMessage>, model: Model, open: boolean) => {
  const editable = canPickTool(model.phase)
  const lutEnabled = model.catalog !== null
  return h.aside(
    [
      h.Class(
        `${open ? 'flex' : 'hidden'} order-3 max-h-[45dvh] shrink-0 flex-col overflow-y-auto border-t border-border bg-panel lg:order-none lg:flex lg:max-h-none lg:w-14 lg:overflow-visible lg:border-r lg:border-t-0`,
      ),
      h.AriaLabel('Adjustment tools'),
    ],
    [
      h.div(
        [
          h.Class(
            'border-b border-border px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-muted lg:hidden',
          ),
        ],
        ['Adjustments'],
      ),
      h.nav(
        [h.Class('flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-visible')],
        LAYER_TYPES_ORDER.map((type) =>
          lazyCard(type, toolCardView, [
            type,
            chainCount(model, type),
            editable,
            lutEnabled,
            model.catalogError,
            model.hoveredTool,
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
  hoveredTool: Model['hoveredTool'],
) => {
  const ui = LAYER_UI[type]
  const disabled = !editable || (type === 'lut' && !lutEnabled)
  const catalogStatus =
    type === 'lut' && !lutEnabled
      ? catalogError === null
        ? 'Loading LUTs…'
        : 'LUTs unavailable'
      : null
  const hovered = hoveredTool === type
  // One hover fact per card: entering (pointer or keyboard focus) names the
  // card; leaving clears it.
  const show = HoveredToolChanged({ type })
  const hide = HoveredToolChanged({ type: null })
  return h.div(
    [h.Class('relative')],
    [
      h.button(
        [
          h.Key(type),
          h.OnClick(SelectedTool({ type })),
          h.OnMouseEnter(show),
          h.OnMouseLeave(hide),
          h.OnFocus(show),
          h.OnBlur(hide),
          ...(disabled ? [h.AriaDisabled(true)] : []),
          h.AriaLabel(`Add ${ui.label} adjustment`),
          h.Class(
            disabled
              ? 'flex w-full cursor-not-allowed flex-col gap-1.5 border-b border-border px-4 py-3 text-left opacity-40 transition-colors lg:items-center lg:gap-0 lg:px-0'
              : 'flex w-full flex-col gap-1.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-panel-alt lg:items-center lg:gap-0 lg:px-0',
          ),
        ],
        [
          h.div(
            [h.Class('flex items-center gap-3 lg:justify-center')],
            [
              icon(h, ui.icon, ui.label),
              // Label + two-line copy stay visible only in the mobile
              // bottom sheet; on the desktop rail the tooltip carries them.
              h.span([h.Class('text-sm font-medium lg:hidden')], [ui.label]),
            ],
          ),
          h.div(
            [h.Class('text-xs leading-4 text-muted lg:hidden')],
            catalogStatus === null
              ? [
                  h.span([h.Class('block')], [ui.description]),
                  h.span([h.Class('block')], [ui.when]),
                ]
              : [catalogStatus],
          ),
          // "Already in your edit": a muted ×N pill pinned to the button's
          // top-right corner — works for both the wide mobile card and the
          // narrow desktop icon. Only when the tool is in the chain — a
          // first-time user sees nothing (docs/adr/0016-tool-panel-cards D4).
          ...(count > 0
            ? [
                h.span(
                  [
                    h.AriaLabel(`In your edit: ${count}`),
                    h.Attribute('data-testid', 'in-edit-badge'),
                    h.Class(
                      'absolute right-1.5 top-1.5 shrink-0 rounded-sm border border-border bg-panel px-1 py-0.5 text-[10px] leading-none text-muted',
                    ),
                  ],
                  [`×${count}`],
                ),
              ]
            : []),
        ],
      ),
      // The custom tooltip: floats to the right of the rail while this card
      // is hovered/focused. Hidden below `lg` — touch has no hover, and
      // there the copy is already printed on the card.
      ...(hovered
        ? [
            h.div(
              [
                h.Attribute('data-testid', 'tool-tooltip'),
                h.Class(
                  'absolute left-full top-0 z-[70] hidden w-56 border border-border bg-panel px-3 py-2 text-xs leading-snug text-muted shadow-lg lg:block',
                ),
              ],
              [
                h.span([h.Class('block text-sm font-medium text-ink')], [ui.label]),
                ...(catalogStatus === null
                  ? [
                      h.span([h.Class('mt-1 block')], [ui.description]),
                      h.span([h.Class('mt-1 block')], [ui.when]),
                    ]
                  : [
                      h.span([h.Class('mt-1 block')], [catalogStatus]),
                      ...(catalogError !== null
                        ? [h.span([h.Class('mt-1 block')], [catalogError.message])]
                        : []),
                    ]),
              ],
            ),
          ]
        : []),
    ],
  )
}
