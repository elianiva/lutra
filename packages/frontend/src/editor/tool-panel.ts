import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { icon, type IconNode } from '../components/icon'
import { AddAdjustment } from '../components/icons'
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
 * Below 480px (`lg`) the rail is not drawn: a touch device has no hover, and the
 * chain rack's `Add` row opens the palette, which lists every tool with its
 * copy.
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
) => {
  const editable = canPickTool(phase)
  const lutEnabled = catalog !== null
  const status = lutStatus(catalog, catalogError)
  const error = catalogError === null ? null : catalogError.message
  return h.aside(
    [
      h.Class('absolute left-6 top-1/2 z-20 hidden w-[52px] -translate-y-1/2 flex-col lg:flex'),
      h.AriaLabel('Adjustment tools'),
    ],
    [
      h.nav(
        [h.Class('surface enter-fade flex flex-col gap-1 p-1.5')],
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
            ? [h.div([h.Class('seam mx-2 my-1')], [])]
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
            `group relative flex h-[38px] w-full items-center justify-center rounded-[12px] transition-colors ${
              disabled ? 'cursor-not-allowed opacity-35' : 'text-muted hover:bg-s2 hover:text-ink'
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
          icon(h, ui.icon, ui.label),
          ...(count > 0
            ? [
                h.span(
                  [
                    h.Class('absolute right-1 top-1 size-1.5 rounded-full bg-accent'),
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
        'surface enter-side pointer-events-none absolute left-full top-0 z-50 ml-3 w-56 p-3 text-left',
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

/** Tools pinned to the phone dock: the ones reached for most. */
const PINNED: readonly LayerType[] = ['lut', 'exposure', 'contrast', 'saturation']

/**
 * The phone dock: the rail's phone counterpart, a pill along the bottom edge
 * with the pinned tools and an `All` button that opens the palette grid.
 * Below `lg` only.
 */
export const toolDock = (
  h: HtmlBuilder<EditorMessage>,
  catalog: Model['catalog'],
  phase: Model['phase'],
): Html => {
  const editable = canPickTool(phase)
  const dockButton = (label: string, Icon: IconNode, message: EditorMessage, disabled: boolean) =>
    h.button(
      [
        h.Class(
          `grid h-11 flex-1 place-items-center rounded-full transition-colors ${
            disabled ? 'cursor-not-allowed opacity-35' : 'text-muted active:bg-s2 active:text-ink'
          }`,
        ),
        h.OnClick(message),
        ...(disabled ? [h.Disabled(true)] : []),
        h.AriaLabel(label),
        h.Key(label),
      ],
      [icon(h, Icon, label, 20)],
    )
  return h.nav(
    [
      h.Class(
        'surface enter-fade absolute inset-x-4 bottom-4 z-20 flex items-center gap-1 rounded-full p-1.5 pb-[max(6px,env(safe-area-inset-bottom))] lg:hidden',
      ),
      h.AriaLabel('Quick tools'),
    ],
    [
      ...PINNED.map((type) =>
        dockButton(
          `Quick add ${LAYER_UI[type].label}`,
          LAYER_UI[type].icon,
          EditorMessage.SelectedTool({ type }),
          !editable || (type === 'lut' && catalog === null),
        ),
      ),
      dockButton('All adjustments', AddAdjustment, EditorMessage.ToggledPalette(), !editable),
    ],
  )
}
