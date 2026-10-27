import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { AddAdjustment } from '../components/icons'
import { icon } from '../components/icon'
import { LAYER_UI } from './layer-meta'
import { EditorMessage } from './message'
import type { Model } from './model'
import type { Layer } from '@lutra/engine'

/**
 * The edit chain as a rack beside the print (docs/adr/0013-materials).
 *
 * It is one surface, sized to its rows and set off the frame's right edge by
 * a gap, not a pile of loose cards: a spine runs down the left gutter, each
 * layer is a row on that spine, and the row numbers read the order top to
 * bottom. The selected row carries the accent wash; a draft hangs off the end
 * of the rack; the last row adds. An empty chain draws no rack at all.
 *
 * Below `lg` the rack lies under the print at full width, because a phone has
 * no room for a column.
 */
export type ChainDockSlice = Pick<Model, 'chain' | 'phase' | 'catalog'>

const lazyRow = createKeyedLazy()

const rowValue = (layer: Layer): string => LAYER_UI[layer.type].formatValue(layer)

const rowView = (
  layer: Layer,
  index: number,
  active: boolean,
  selected: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html =>
  h.button(
    [
      h.Key(layer.id),
      h.Class(
        `relative flex items-center gap-2 rounded-[8px] px-1.5 py-1.5 text-left transition-colors lg:w-full ${
          active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-s2 hover:text-ink'
        }`,
      ),
      h.OnClick(EditorMessage.SelectedLayer({ id: layer.id })),
      h.AriaPressed(String(selected)),
      h.AriaLabel(`${LAYER_UI[layer.type].label} layer`),
      h.Title(`${LAYER_UI[layer.type].label} · ${rowValue(layer)}`),
      h.DataAttribute('layer-id', layer.id),
    ],
    [
      // the number sits on the spine and masks it, so the line reads as
      // continuous between rows
      h.span(
        [
          h.Class(
            `relative z-10 grid w-5 flex-none place-items-center bg-[inherit] font-mono text-[8px] tabular-nums ${
              active ? 'text-accent' : 'text-dim'
            }`,
          ),
          h.Style({ backgroundColor: active ? 'var(--mat-accent-soft)' : 'var(--mat-s1)' }),
        ],
        [String(index + 1).padStart(2, '0')],
      ),
      h.span(
        [h.Class('flex-none opacity-90')],
        [icon(h, LAYER_UI[layer.type].icon, LAYER_UI[layer.type].label, 12)],
      ),
      h.span([h.Class('min-w-0 flex-1 truncate text-[11px]')], [LAYER_UI[layer.type].label]),
      h.span(
        [h.Class('tnum flex-none font-mono text-[10px] whitespace-nowrap')],
        [rowValue(layer)],
      ),
    ],
  )

const draftRowView = (layer: Layer, index: number, h: HtmlBuilder<EditorMessage>): Html =>
  h.div(
    [
      h.Class('relative flex items-center gap-2 rounded-[8px] bg-accent-soft px-1.5 py-1.5'),
      h.AriaLabel('Draft adjustment'),
    ],
    [
      h.span(
        [
          h.Class(
            'relative z-10 grid w-5 flex-none place-items-center font-mono text-[8px] text-accent',
          ),
          h.Style({ backgroundColor: 'var(--mat-accent-soft)' }),
        ],
        [String(index + 1).padStart(2, '0')],
      ),
      h.span(
        [h.Class('flex-none text-accent')],
        [icon(h, LAYER_UI[layer.type].icon, LAYER_UI[layer.type].label, 12)],
      ),
      h.span([h.Class('min-w-0 flex-1 truncate text-[11px] text-accent')], ['Draft']),
      h.span(
        [h.Class('tnum flex-none font-mono text-[10px] text-accent whitespace-nowrap')],
        [rowValue(layer)],
      ),
    ],
  )

export const chainDock = (h: HtmlBuilder<EditorMessage>, slice: ChainDockSlice): Html => {
  const selectedId = slice.phase._tag === 'Selected' ? slice.phase.layerId : null
  const drafting = slice.phase._tag === 'Drafting'
  return h.div(
    [
      // It hugs its rows and sits beside the print, not stretched to the
      // frame's height: a short chain is a short rack.
      h.Class('surface flex flex-none flex-col py-2 lg:w-[212px] lg:self-start'),
      h.AriaLabel('Edit chain'),
      h.DataAttribute('testid', 'chain-dock'),
      h.DataAttribute('keep-selection', ''),
    ],
    [
      h.div(
        [h.Class('flex items-baseline justify-between gap-2 px-3 pb-1')],
        [
          h.span([h.Class('micro')], ['Chain']),
          h.span([h.Class('micro tnum font-mono')], [String(slice.chain.length).padStart(2, '0')]),
        ],
      ),
      h.div(
        [
          h.Class('relative flex flex-col gap-0.5 px-2 lg:px-2'),
          h.DataAttribute('testid', 'chain-list'),
        ],
        [
          // the spine: one line through every row number
          h.span(
            [
              h.Class('pointer-events-none absolute bottom-3 left-[18px] top-3 w-px max-lg:hidden'),
              h.Style({
                background:
                  'linear-gradient(180deg, transparent, var(--mat-fade) 10%, var(--mat-fade) 90%, transparent)',
              }),
            ],
            [],
          ),
          ...slice.chain.map((layer, index) =>
            lazyRow(layer.id, rowView, [
              layer,
              index,
              drafting ? false : layer.id === selectedId,
              layer.id === selectedId,
              h,
            ])!,
          ),
          ...(drafting ? [draftRowView(slice.phase.layer, slice.chain.length, h)] : []),
        ],
      ),
      // The one way to add besides the rail: the end of the chain. It is the
      // last row of the rack, so "where do layers come from" and "where does
      // this chain end" are the same place (docs/adr/0013-materials).
      h.div(
        [h.Class('mt-1 px-2 pt-1')],
        [
          h.button(
            [
              h.Class(
                'flex w-full items-center gap-2 rounded-[8px] px-1.5 py-1.5 text-muted transition-colors hover:bg-s2 hover:text-ink',
              ),
              h.OnClick(EditorMessage.ToggledPalette()),
              h.AriaLabel('Add adjustment'),
              h.Title('Add adjustment · ⌘K'),
              h.DataAttribute('testid', 'chain-add'),
            ],
            [
              icon(h, AddAdjustment, 'Add adjustment', 12),
              h.span([h.Class('min-w-0 flex-1 truncate text-left text-[11px]')], ['Add']),
              // a phone has no ⌘K
              h.span([h.Class('max-lg:hidden flex-none font-mono text-[8px] text-dim')], ['⌘K']),
            ],
          ),
        ],
      ),
    ],
  )
}
