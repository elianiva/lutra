import { type Html, type HtmlBuilder } from 'foldkit/html'
import { Search } from 'lucide'
import { icon } from '../components/icon'
import { LAYER_UI, LAYER_TYPES_ORDER } from './layer-meta'
import { EditorMessage } from './message'
import type { Model } from './model'
import type { LayerType } from '@lutra/engine'

/**
 * The add-adjustment palette (docs/adr/0013-materials): ⌘K, or the `+` at the
 * end of the dock, opens a searchable list of all thirteen tools. It is the
 * only way in besides the rail, so the rail can stay icons-only.
 *
 * Picking a row dispatches `SelectedTool`, which is the same message the rail
 * sends — one path into the draft transaction, two ways to reach it.
 */
export type PaletteSlice = Pick<
  Model,
  'chain' | 'catalog' | 'catalogError' | 'paletteOpen' | 'paletteQuery' | 'phase'
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

export const palette = (h: HtmlBuilder<EditorMessage>, slice: PaletteSlice): Html | null => {
  if (!slice.paletteOpen) {
    return null
  }
  const enabled = slice.catalog !== null
  const rows = LAYER_TYPES_ORDER.filter((type) => matches(type, slice.paletteQuery))
  let lastGroup = ''

  return h.div(
    [h.Class('contents')],
    [
      h.div([
        h.Class('fixed inset-0 z-30'),
        h.OnClick(EditorMessage.ToggledPalette()),
        h.AriaHidden(true),
      ]),
      h.div(
        [
          h.Class(
            'surface-raised absolute bottom-[180px] left-6 z-40 flex max-h-[min(560px,calc(100vh-260px))] w-[min(460px,calc(100vw-48px))] flex-col overflow-hidden lg:left-[100px]',
          ),
          h.AriaLabel('Add an adjustment'),
          h.DataAttribute('testid', 'palette'),
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
              const disabled = !enabled || type === 'lut' ? !enabled : false
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
