import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { Plus } from 'lucide'
import { icon } from '../components/icon'
import { LAYER_UI } from './layer-meta'
import { EditorMessage } from './message'
import type { Model } from './model'
import type { Layer } from '@lutra/engine'

/**
 * The chain, attached to the print (docs/adr/0013-materials). It is a column
 * inside the print card — the frame's own table of contents — so the order of
 * the chain and the picture it produces are read in one place.
 *
 * Each entry carries its position (01, 02 …), its value and its name. The
 * numbers plus the vertical order ARE the hierarchy; a hairline runs behind
 * the numbers to make the sequence visible at a glance.
 *
 * Below `lg` the column turns into a horizontal strip under the print, because
 * a phone has no room for a sidebar.
 */
export type ChainDockSlice = Pick<Model, 'chain' | 'phase' | 'catalog'>

const lazyItem = createKeyedLazy()

const itemValue = (layer: Layer): string => LAYER_UI[layer.type].formatValue(layer)

const itemView = (
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
        `group relative flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-left transition-colors lg:w-full ${
          active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-s2 hover:text-ink'
        }`,
      ),
      h.OnClick(EditorMessage.SelectedLayer({ id: layer.id })),
      h.AriaPressed(String(selected)),
      h.AriaLabel(`${LAYER_UI[layer.type].label} layer`),
      h.Title(`${LAYER_UI[layer.type].label} · ${itemValue(layer)}`),
      h.DataAttribute('layer-id', layer.id),
    ],
    [
      // the connector: a short stub back to the frame's spine
      h.span(
        [
          h.Class('absolute -left-2 top-1/2 hidden h-px w-2.5 lg:block'),
          h.Style({ background: 'var(--mat-fade)' }),
        ],
        [],
      ),
      h.span(
        [h.Class('w-4 flex-none font-mono text-[8px] tabular-nums opacity-70')],
        [String(index + 1).padStart(2, '0')],
      ),
      h.span(
        [h.Class('flex-none')],
        [icon(h, LAYER_UI[layer.type].icon, LAYER_UI[layer.type].label, 13)],
      ),
      h.span(
        [h.Class('flex min-w-0 flex-col gap-0.5')],
        [
          h.span(
            [h.Class('tnum font-mono text-[11px] leading-none whitespace-nowrap')],
            [itemValue(layer)],
          ),
          h.span([h.Class('micro truncate leading-none')], [LAYER_UI[layer.type].label]),
        ],
      ),
    ],
  )

const draftItemView = (layer: Layer, index: number, h: HtmlBuilder<EditorMessage>): Html =>
  h.div(
    [
      h.Class('flex items-center gap-2 rounded-[10px] bg-accent-soft px-2 py-1.5'),
      h.AriaLabel('Draft adjustment'),
    ],
    [
      h.span(
        [h.Class('w-4 flex-none font-mono text-[8px] tabular-nums text-accent')],
        [String(index + 1).padStart(2, '0')],
      ),
      h.span(
        [h.Class('flex-none text-accent')],
        [icon(h, LAYER_UI[layer.type].icon, LAYER_UI[layer.type].label, 13)],
      ),
      h.span(
        [h.Class('flex min-w-0 flex-col gap-0.5')],
        [
          h.span(
            [h.Class('tnum font-mono text-[11px] leading-none text-accent whitespace-nowrap')],
            [itemValue(layer)],
          ),
          h.span([h.Class('micro truncate leading-none text-accent')], ['draft']),
        ],
      ),
    ],
  )

export const chainDock = (h: HtmlBuilder<EditorMessage>, slice: ChainDockSlice): Html => {
  const selectedId = slice.phase._tag === 'Selected' ? slice.phase.layerId : null
  const drafting = slice.phase._tag === 'Drafting'
  return h.div(
    [
      h.Class('flex flex-none flex-col gap-2 max-lg:pt-2 lg:w-[176px] lg:gap-1.5 lg:pt-0'),
      h.AriaLabel('Edit chain'),
      h.DataAttribute('testid', 'chain-dock'),
    ],
    [
      h.div(
        [
          h.Class(
            'flex gap-1 overflow-x-auto pb-1 lg:relative lg:flex-col lg:overflow-visible lg:pb-0',
          ),
        ],
        [
          // the sequence line behind the numbers (desktop column only)
          h.span(
            [
              h.Class('pointer-events-none absolute bottom-6 left-4 top-8 hidden w-px lg:block'),
              h.Style({
                background:
                  'linear-gradient(180deg, transparent, var(--mat-fade) 12%, var(--mat-fade) 88%, transparent)',
              }),
            ],
            [],
          ),
          ...slice.chain.map((layer, index) =>
            lazyItem(layer.id, itemView, [
              layer,
              index,
              !drafting && layer.id === selectedId,
              layer.id === selectedId,
              h,
            ])!,
          ),
          ...(drafting ? [draftItemView(slice.phase.layer, slice.chain.length, h)] : []),
          h.button(
            [
              h.Class(
                'flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-muted transition-colors hover:bg-s2 hover:text-ink lg:w-full',
              ),
              h.OnClick(EditorMessage.ToggledPalette()),
              h.AriaLabel('Add adjustment'),
              h.Title('Add adjustment'),
            ],
            [
              h.span(
                [h.Class('grid w-4 flex-none place-items-center')],
                [icon(h, Plus, 'Add adjustment', 12)],
              ),
              h.span([h.Class('micro whitespace-nowrap')], ['Add']),
            ],
          ),
        ],
      ),
    ],
  )
}
