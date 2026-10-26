import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { icon } from '../components/icon'
import { LAYER_UI, LAYER_TYPES_ORDER } from './layer-meta'
import { EditorMessage } from './message'
import type { Model } from './model'
import type { EditorPhase } from './phase'
import type { LayerType } from '@lutra/engine'

/**
 * The tool rail (docs/adr/0013-materials). Thirteen icons in a floating
 * column; hovering (or focusing) one opens a card with its number, name and
 * the two-line copy — the labels live in the card, not in the rail, so the
 * rail stays narrow enough to float.
 *
 * Below `lg` the same component renders as the tools sheet: full-width rows
 * with the icon, the name and the copy, because a touch device has no hover.
 *
 * The rail is disabled until an image is loaded and while a draft is open
 * (the phase machine owns the real gate; this mirrors it so the buttons read
 * as disabled rather than dead).
 */
const lazyTool = createKeyedLazy()

const lutStatus = (
  catalog: Model['catalog'],
  catalogError: Model['catalogError'],
): string | null =>
  catalog === null ? (catalogError === null ? 'Loading LUTs…' : 'LUTs unavailable') : null

const toolButton = (
  type: LayerType,
  count: number,
  disabled: boolean,
  hovered: boolean,
  status: string | null,
  error: string | null,
  h: HtmlBuilder<EditorMessage>,
): Html => toolButtonImpl(h, type, count, disabled, hovered, status, error)

export const toolPanel = (
  h: HtmlBuilder<EditorMessage>,
  chain: Model['chain'],
  catalog: Model['catalog'],
  catalogError: Model['catalogError'],
  phase: Model['phase'],
  hoveredTool: Model['hoveredTool'],
  open: boolean,
) => {
  const editable = canPickTool(phase)
  const lutEnabled = catalog !== null
  const status = lutStatus(catalog, catalogError)
  const error = catalogError === null ? null : catalogError.message
  return h.aside(
    [
      h.Class(
        `${open ? 'flex' : 'hidden'} absolute inset-x-0 bottom-[72px] z-30 max-h-[70dvh] w-full flex-col overflow-y-auto rounded-t-[18px] bg-s1 p-2 shadow-[0_-24px_48px_-20px_var(--mat-shadow-a)] lg:bottom-auto lg:left-6 lg:right-auto lg:top-1/2 lg:z-20 lg:-translate-y-1/2 lg:flex lg:max-h-none lg:w-[52px] lg:flex-none lg:overflow-visible lg:rounded-[18px] lg:bg-transparent lg:p-0 lg:shadow-none`,
      ),
      h.AriaLabel('Adjustment tools'),
    ],
    [
      h.nav(
        [
          h.Class(
            'surface flex flex-col gap-1 p-1.5 max-lg:gap-0.5 max-lg:rounded-none max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none',
          ),
        ],
        LAYER_TYPES_ORDER.flatMap((type, index) => [
          lazyTool(type, toolButton, [
            type,
            chainCount(chain, type),
            !editable || (type === 'lut' && !lutEnabled),
            hoveredTool === type,
            type === 'lut' ? status : null,
            type === 'lut' ? error : null,
            h,
          ])!,
          // group seams: Look | Light | Color | Film | Optics
          ...(index === 0 || index === 5 || index === 8 || index === 10
            ? [h.div([h.Class('seam mx-2 my-1 hidden lg:block')], [])]
            : []),
        ]),
      ),
    ],
  )
}

/** The machine owns the real gate (no SelectedTool edge from Empty/Loading/
 *  Error/Drafting — see ./phase.ts); this mirrors it so the buttons read as
 *  disabled instead of dead. */
export const canPickTool = (phase: EditorPhase) =>
  phase._tag === 'Idle' || phase._tag === 'Selected'

/** How many committed layers of this type are in the edit. */
export const chainCount = (chain: Model['chain'], type: LayerType): number =>
  chain.filter((layer) => layer.type === type).length

const toolButtonImpl = (
  h: HtmlBuilder<EditorMessage>,
  type: LayerType,
  count: number,
  disabled: boolean,
  hovered: boolean,
  status: string | null,
  error: string | null,
): Html => {
  const ui = LAYER_UI[type]
  return h.div(
    [h.Class('relative')],
    [
      h.button(
        [
          h.Class(
            `group relative flex w-full items-center gap-3 rounded-[12px] px-4 py-2.5 text-left transition-colors max-lg:flex-col max-lg:items-start max-lg:gap-1 lg:h-[38px] lg:justify-center lg:px-0 lg:py-0 ${
              disabled
                ? 'cursor-not-allowed opacity-35'
                : 'text-muted hover:bg-s2 hover:text-ink lg:hover:bg-s2'
            }`,
          ),
          h.OnClick(EditorMessage.SelectedTool({ type })),
          ...(disabled ? [h.Disabled(true)] : []),
          h.OnMouseEnter(EditorMessage.HoveredToolChanged({ type })),
          h.OnMouseLeave(EditorMessage.HoveredToolChanged({ type: null })),
          h.OnFocus(EditorMessage.HoveredToolChanged({ type })),
          h.OnBlur(EditorMessage.HoveredToolChanged({ type: null })),
          h.AriaLabel(`Add ${ui.label} adjustment`),
          h.Key(type),
        ],
        [
          h.span(
            [h.Class('flex items-center gap-3')],
            [
              h.span([h.Class('flex w-4 flex-none justify-center')], [icon(h, ui.icon, ui.label)]),
              h.span([h.Class('flex-1 text-[13px] lg:hidden')], [ui.label]),
            ],
          ),
          ...(status === null
            ? [
                h.span(
                  [h.Class('hidden text-[10px] leading-snug text-dim max-lg:block')],
                  [ui.description],
                ),
                h.span(
                  [h.Class('hidden text-[10px] leading-snug text-dim max-lg:block')],
                  [ui.when],
                ),
              ]
            : [
                h.span(
                  [h.Class('hidden text-[10px] leading-snug text-dim max-lg:block')],
                  [status],
                ),
              ]),
          ...(count > 0
            ? [h.span([h.Class('hidden text-[10px] text-dim max-lg:block')], [`×${String(count)}`])]
            : []),
          ...(count > 0
            ? [h.span([h.Class('max-lg:block hidden text-[10px] text-dim')], [`×${String(count)}`])]
            : []),
          ...(count > 0
            ? [
                h.span(
                  [
                    h.Class(
                      'absolute right-1 top-1 hidden size-1.5 rounded-full bg-accent lg:block',
                    ),
                    h.AriaLabel(`In your edit: ${String(count)}`),
                    h.DataAttribute('testid', 'in-edit-badge'),
                  ],
                  [],
                ),
              ]
            : []),
        ],
      ),
      ...(hovered ? [toolCard(h, type, count, status, error)] : []),
    ],
  )
}

/** The hover card: number, name, what it does, when to reach for it. */
const toolCard = (
  h: HtmlBuilder<EditorMessage>,
  type: LayerType,
  count: number,
  status: string | null,
  error: string | null,
): Html => {
  const ui = LAYER_UI[type]
  const index = LAYER_TYPES_ORDER.indexOf(type) + 1
  return h.div(
    [
      h.Class(
        'surface pointer-events-none absolute left-full top-0 z-50 ml-3 hidden w-56 p-3 text-left lg:block',
      ),
      h.DataAttribute('testid', 'tool-tooltip'),
    ],
    [
      h.div(
        [h.Class('micro mb-2 flex items-center justify-between gap-2')],
        [
          h.span([], [`${String(index).padStart(2, '0')} · ${groupOf(type)}`]),
          h.span([], [count > 0 ? `${String(count)} in chain` : '']),
        ],
      ),
      h.div([h.Class('mb-1 text-xs text-ink')], [ui.label]),
      ...(status === null
        ? [
            h.p([h.Class('text-[10px] leading-snug text-muted')], [ui.description]),
            h.p([h.Class('mt-1 text-[10px] leading-snug text-dim')], [ui.when]),
          ]
        : [
            h.p([h.Class('text-[10px] leading-snug text-muted')], [status]),
            ...(error === null
              ? []
              : [h.p([h.Class('mt-1 text-[10px] leading-snug text-dim')], [error])]),
          ]),
    ],
  )
}

const groupOf = (type: LayerType): string => {
  const index = LAYER_TYPES_ORDER.indexOf(type)
  if (index === 0) {
    return 'Look'
  }
  if (index <= 5) {
    return 'Light'
  }
  if (index <= 8) {
    return 'Color'
  }
  if (index <= 10) {
    return 'Film'
  }
  return 'Optics'
}
