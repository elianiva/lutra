import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { Plus } from 'lucide'
import { icon } from '../components/icon'
import { LAYER_UI } from './layer-meta'
import { EditorMessage } from './message'
import type { Model } from './model'
import type { Layer } from '@lutra/engine'

/**
 * The chain dock (docs/adr/0013-materials): the edit chain as a row of
 * separate pills under the canvas. Each pill is one layer — its value on top,
 * its name below. Clicking a pill selects that layer; the inspector edits
 * whatever is selected.
 *
 * Pills are separate surfaces, not segments of one strip: no separator lines,
 * and the gaps do the grouping. The selected pill carries the accent wash and
 * a halo.
 */
export type ChainDockSlice = Pick<Model, 'chain' | 'phase' | 'catalog'>

const lazyPill = createKeyedLazy()

const dockValue = (layer: Layer): string => {
  const ui = LAYER_UI[layer.type]
  return ui.formatValue(layer)
}

const pillView = (
  layer: Layer,
  active: boolean,
  selected: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html =>
  h.button(
    [
      h.Key(layer.id),
      h.Class(
        `pill flex h-14 min-w-[112px] items-center gap-2 px-4 text-left transition-[box-shadow,background-color] ${
          active ? 'pill-active' : selected ? 'text-ink' : 'text-muted hover:bg-s2 hover:text-ink'
        }`,
      ),
      h.OnClick(EditorMessage.SelectedLayer({ id: layer.id })),
      h.AriaPressed(String(selected)),
      h.AriaLabel(`${LAYER_UI[layer.type].label} layer`),
      h.Title(`${LAYER_UI[layer.type].label} · ${dockValue(layer)}`),
      h.DataAttribute('layer-id', layer.id),
    ],
    [
      h.span(
        [h.Class(active ? 'text-accent' : 'text-dim')],
        [icon(h, LAYER_UI[layer.type].icon, LAYER_UI[layer.type].label, 14)],
      ),
      h.span(
        [h.Class('flex min-w-0 flex-col')],
        [
          h.span(
            [h.Class('tnum font-mono text-xs leading-tight whitespace-nowrap')],
            [dockValue(layer)],
          ),
          h.span([h.Class('micro truncate leading-tight')], [LAYER_UI[layer.type].label]),
        ],
      ),
    ],
  )

const draftPillView = (layer: Layer, h: HtmlBuilder<EditorMessage>): Html =>
  h.div(
    [
      h.Class('pill pill-active flex h-14 min-w-[104px] items-center gap-2 px-4'),
      h.AriaLabel('Draft adjustment'),
    ],
    [
      h.span(
        [h.Class('text-accent')],
        [icon(h, LAYER_UI[layer.type].icon, LAYER_UI[layer.type].label, 14)],
      ),
      h.span(
        [h.Class('flex min-w-0 flex-col')],
        [
          h.span([h.Class('tnum truncate font-mono text-xs leading-tight')], [dockValue(layer)]),
          h.span(
            [h.Class('micro truncate leading-tight')],
            [`${LAYER_UI[layer.type].label} · draft`],
          ),
        ],
      ),
    ],
  )

export const chainDock = (h: HtmlBuilder<EditorMessage>, slice: ChainDockSlice): Html => {
  const selectedId = slice.phase._tag === 'Selected' ? slice.phase.layerId : null
  return h.div(
    [
      h.Class(
        'flex flex-none items-center gap-2 overflow-x-auto p-1 max-lg:justify-start lg:self-center lg:justify-center',
      ),
      h.AriaLabel('Edit chain'),
      h.DataAttribute('testid', 'chain-dock'),
    ],
    [
      ...slice.chain.map((layer) =>
        lazyPill(layer.id, pillView, [
          layer,
          // While a draft is open the draft pill is the only accent one: the
          // chain is not editable in that state, so highlighting a chain pill
          // would point at a layer the draft is not editing.
          slice.phase._tag === 'Drafting' ? false : layer.id === selectedId,
          layer.id === selectedId,
          h,
        ])!,
      ),
      ...(slice.phase._tag === 'Drafting' ? [draftPillView(slice.phase.layer, h)] : []),
      h.button(
        [
          h.Class(
            'pill grid h-14 w-14 flex-none place-items-center text-muted transition-colors hover:bg-s2 hover:text-ink',
          ),
          h.OnClick(EditorMessage.ToggledPalette()),
          h.AriaLabel('Add adjustment'),
          h.Title('Add adjustment'),
        ],
        [icon(h, Plus, 'Add adjustment', 16)],
      ),
    ],
  )
}
