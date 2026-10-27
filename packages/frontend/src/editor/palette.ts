import { Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import { Search } from '../components/icons'
import { icon } from '../components/icon'
import * as Tabs from '../components/ui/tabs'
import { LAYER_UI, LAYER_TYPES_ORDER } from './layer-meta'
import { EditorMessage } from './message'
import type { Model } from './model'
import type { LayerType } from '@lutra/engine'

/**
 * The add-adjustment palette (docs/adr/0013-materials): ⌘K (bound in the
 * root's subscriptions), or the one `Add` row at the end of the rack, opens a
 * searchable list of all thirteen tools.
 *
 * Adding an effect has exactly two entry points in the whole app: the rail,
 * which lists the tools by icon for a known target, and this palette, which
 * searches them by name when you do not know which one you want. The palette
 * dispatches `SelectedTool`, the same message the rail sends — one path into
 * the draft transaction, two ways to reach it.
 */
export type PaletteSlice = Pick<
  Model,
  'chain' | 'catalog' | 'catalogError' | 'paletteOpen' | 'paletteQuery' | 'paletteGroup' | 'phase'
>

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

const GROUPS = ['Look', 'Light', 'Color', 'Film', 'Optics'] as const

const matches = (type: LayerType, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return true
  }
  const ui = LAYER_UI[type]
  return [ui.label, ui.description, ui.when, groupOf(type)].some((text) =>
    text.toLowerCase().includes(needle),
  )
}

/** Phone sheet: always mounted so closing can slide it back down. */
const phoneSheet = (h: HtmlBuilder<EditorMessage>, slice: PaletteSlice): Html => {
  const open = slice.paletteOpen
  const enabled = slice.catalog !== null
  const group = slice.paletteGroup
  return h.div(
    [h.Class('contents lg:hidden')],
    [
      h.div([
        h.Class(
          `fixed inset-0 z-30 transition-opacity duration-300 ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`,
        ),
        h.OnClick(EditorMessage.ToggledPalette()),
        h.AriaHidden(true),
      ]),
      h.div(
        [
          h.Class(
            `surface-raised absolute inset-x-0 bottom-0 z-40 flex max-h-[75dvh] flex-col overflow-hidden rounded-b-none rounded-t-[22px] pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              open
                ? 'translate-y-0'
                : 'invisible translate-y-full [transition-property:translate,visibility] [transition-delay:0s,300ms]'
            }`,
          ),
          h.AriaLabel('Add an adjustment'),
          h.DataAttribute('testid', 'palette'),
          ...(open ? [] : [h.AriaHidden(true)]),
        ],
        [
          h.button(
            [
              h.Class('grid h-6 w-full flex-none place-items-center'),
              h.OnClick(EditorMessage.ToggledPalette()),
              h.AriaLabel('Close the palette'),
            ],
            [h.span([h.Class('h-1 w-9 rounded-full bg-dim/40')], [])],
          ),
          // one tab per category; the selected pill slides between them
          h.div(
            [
              h.Class('relative mx-3 mb-2 grid grid-flow-col auto-cols-fr'),
              h.AriaLabel('Categories'),
            ],
            [
              Tabs.indicator(
                {
                  index: Math.max(
                    0,
                    GROUPS.findIndex((g) => g === group),
                  ),
                  count: GROUPS.length,
                  pad: 0,
                  className: 'rounded-full bg-s2 shadow-none dark:bg-s2',
                },
                h,
              ),
              ...GROUPS.map((g) =>
                h.button(
                  [
                    h.Class(
                      `relative z-10 rounded-full py-1.5 text-[10px] uppercase tracking-[0.1em] transition-colors duration-200 ${
                        group === g ? 'text-ink' : 'text-dim'
                      }`,
                    ),
                    h.OnClick(EditorMessage.ChangedPaletteGroup({ group: g })),
                    h.AriaPressed(String(group === g)),
                    h.Key(g),
                  ],
                  [g],
                ),
              ),
            ],
          ),
          h.div(
            [h.Class('grid h-[168px] grid-cols-4 content-start gap-1 overflow-y-auto px-3 pb-4')],
            LAYER_TYPES_ORDER.filter((type) => groupOf(type) === group).map((type) => {
              const ui = LAYER_UI[type]
              const count = slice.chain.filter((layer) => layer.type === type).length
              const disabled = type === 'lut' && !enabled
              return h.button(
                [
                  h.Class(
                    `relative flex flex-col items-center gap-1.5 rounded-[10px] px-1 py-3 text-center transition-colors ${
                      disabled ? 'cursor-not-allowed opacity-40' : 'active:bg-s2'
                    }`,
                  ),
                  h.OnClick(EditorMessage.SelectedTool({ type })),
                  ...(disabled ? [h.Disabled(true)] : []),
                  h.AriaLabel(`Add ${ui.label} adjustment`),
                  h.Key(type),
                ],
                [
                  h.span([h.Class('text-muted')], [icon(h, ui.icon, ui.label, 14)]),
                  h.span([h.Class('text-[10px] leading-tight text-muted')], [ui.label]),
                  ...(count > 0
                    ? [
                        h.span(
                          [h.Class('absolute right-2 top-2 size-1.5 rounded-full bg-accent')],
                          [],
                        ),
                      ]
                    : []),
                ],
              )
            }),
          ),
        ],
      ),
    ],
  )
}

/** Desktop palette: a searchable list, mounted only while open. */
const desktopPalette = (h: HtmlBuilder<EditorMessage>, slice: PaletteSlice): Html => {
  const enabled = slice.catalog !== null
  const rows = LAYER_TYPES_ORDER.filter((type) => matches(type, slice.paletteQuery))
  let lastGroup = ''

  return h.div(
    [h.Class('contents max-lg:hidden')],
    [
      h.div([
        h.Class('fixed inset-0 z-30'),
        h.OnClick(EditorMessage.ToggledPalette()),
        h.AriaHidden(true),
      ]),
      h.div(
        [
          h.Class(
            'surface-raised absolute bottom-[180px] left-[100px] z-40 flex max-h-[min(560px,calc(100vh-260px))] w-[min(460px,calc(100vw-48px))] flex-col overflow-hidden',
          ),
          h.AriaLabel('Add an adjustment'),
          h.DataAttribute('testid', 'palette'),
          // Escape closes from the search field or from a row.
          h.OnKeyDownPreventDefault((key) =>
            key === 'Escape' ? Option.some(EditorMessage.ToggledPalette()) : Option.none(),
          ),
        ],
        [
          h.div(
            [h.Class('flex items-center gap-3 px-4 py-4 text-dim')],
            [
              icon(h, Search, 'Search', 14),
              h.input([
                h.Class('w-full bg-transparent text-xs text-ink outline-none placeholder:text-dim'),
                h.Type('text'),
                h.Placeholder('Add an adjustment'),
                h.Value(slice.paletteQuery),
                h.Autofocus(true),
                h.AriaLabel('Search adjustments'),
                h.OnInput((value: string) => EditorMessage.ChangedPaletteQuery({ query: value })),
              ]),
              h.button(
                [
                  h.Class(
                    'rounded-[6px] bg-s2 px-1.5 py-1 text-[8px] tracking-[0.1em] text-dim hover:text-ink',
                  ),
                  h.OnClick(EditorMessage.ToggledPalette()),
                  h.AriaLabel('Close the palette'),
                ],
                ['esc'],
              ),
            ],
          ),
          h.div(
            [
              h.Class(
                'min-h-0 overflow-y-auto px-2 pb-2 [mask-image:linear-gradient(to_bottom,#000_94%,transparent)]',
              ),
            ],
            rows.flatMap((type) => {
              const group = groupOf(type)
              const heading =
                group === lastGroup
                  ? []
                  : [
                      h.div(
                        [h.Class('px-3 pb-1 pt-4 text-[8px] uppercase tracking-[0.2em] text-dim')],
                        [group],
                      ),
                    ]
              lastGroup = group
              const ui = LAYER_UI[type]
              const index = LAYER_TYPES_ORDER.indexOf(type) + 1
              const count = slice.chain.filter((layer) => layer.type === type).length
              const disabled = type === 'lut' && !enabled
              return [
                ...heading,
                h.button(
                  [
                    h.Class(
                      `flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-left transition-colors ${
                        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-s2'
                      }`,
                    ),
                    h.OnClick(EditorMessage.SelectedTool({ type })),
                    ...(disabled ? [h.Disabled(true)] : []),
                    h.AriaLabel(`Add ${ui.label} adjustment`),
                    h.Key(type),
                  ],
                  [
                    h.span(
                      [h.Class('w-6 font-mono text-[8px] text-dim')],
                      [String(index).padStart(2, '0')],
                    ),
                    h.span([h.Class('w-4 text-muted')], [icon(h, ui.icon, ui.label, 14)]),
                    h.span([h.Class('flex-1 text-xs text-muted')], [ui.label]),
                    h.span(
                      [h.Class('hidden max-w-[180px] truncate text-[9px] text-dim sm:block')],
                      [ui.description],
                    ),
                    count > 0
                      ? h.span([h.Class('size-1.5 rounded-full bg-accent')], [])
                      : h.span([h.Class('size-1.5')], []),
                  ],
                ),
              ]
            }),
          ),
          h.div(
            [h.Class('flex items-center justify-between px-4 pb-4 pt-2')],
            [
              h.span([h.Class('micro')], [`${String(rows.length)} adjustments`]),
              h.span([h.Class('micro')], ['pick one to draft']),
            ],
          ),
        ],
      ),
    ],
  )
}

export const palette = (h: HtmlBuilder<EditorMessage>, slice: PaletteSlice): Html =>
  h.div(
    [h.Class('contents')],
    [phoneSheet(h, slice), ...(slice.paletteOpen ? [desktopPalette(h, slice)] : [])],
  )
