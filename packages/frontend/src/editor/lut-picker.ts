import type { HtmlBuilder } from 'foldkit/html'
import { ChevronDown, ChevronRight } from 'lucide'
import { icon } from '../components/icon'
import { lutName } from './layer-meta'
import { ToggledLutPicker } from './message'
import type { EditorMessage } from './message'
import type { Model } from './model'
import type { LutId } from '@lutra/engine'
import type { LutCatalogEntry } from '../luts/store'

/**
 * The inline LUT picker (context.md): a selector row showing the current
 * LUT, expanding to per-category accordions (native `<details>`) with a
 * thumbnail list (image on the left, label on the right). Selecting dispatches `onPick(lutId)` — the update loop
 * re-renders live and the picker stays open for comparison.
 */
export const lutPicker = (
  h: HtmlBuilder<EditorMessage>,
  model: Model,
  lutId: LutId,
  onPick: (lutId: LutId) => EditorMessage,
) => {
  const catalog = model.catalog ?? []
  const current = lutName(catalog, lutId)

  return h.div(
    [h.Class('flex flex-col gap-2')],
    [
      h.button(
        [
          h.OnClick(ToggledLutPicker()),
          h.AriaLabel('Choose LUT'),
          h.Class(
            'flex w-full items-center justify-between gap-2 rounded border border-border bg-bg px-3 py-2 text-left text-xs hover:border-muted',
          ),
        ],
        [
          h.span([h.Class('truncate')], [current]),
          icon(h, model.lutPickerOpen ? ChevronDown : ChevronRight, 'Expand LUT picker'),
        ],
      ),
      ...(model.lutPickerOpen
        ? [pickerBody(h, catalog, lutId, onPick)]
        : []),
    ],
  )
}

/** Group the catalog by category, preserving first-seen order. */
const groupByCategory = (
  catalog: ReadonlyArray<LutCatalogEntry>,
): ReadonlyArray<{ readonly category: string; readonly luts: ReadonlyArray<LutCatalogEntry> }> => {
  const groups: Array<{ category: string; luts: Array<LutCatalogEntry> }> = []
  for (const entry of catalog) {
    const group = groups.find((g) => g.category === entry.category)
    if (group) {
      group.luts.push(entry)
    } else {
      groups.push({ category: entry.category, luts: [entry] })
    }
  }
  return groups
}

const pickerBody = (
  h: HtmlBuilder<EditorMessage>,
  catalog: ReadonlyArray<LutCatalogEntry>,
  lutId: LutId,
  onPick: (lutId: LutId) => EditorMessage,
) =>
  h.div(
    [h.Class('flex max-h-72 flex-col gap-1 overflow-y-auto rounded border border-border bg-bg p-2')],
    groupByCategory(catalog).map((group) =>
      h.details(
        [h.Class('group')],
        [
          h.summary(
            [
              h.Class(
                'flex cursor-pointer select-none items-center justify-between rounded px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted hover:bg-panel-alt hover:text-ink',
              ),
            ],
            [
              h.span([], [group.category]),
              h.span([h.Class('tnum')], [String(group.luts.length)]),
            ],
          ),
          h.div(
            [h.Class('flex flex-col gap-0.5 p-1')],
            group.luts.map((entry) => lutRow(h, entry, entry.lut_file === lutId, onPick)),
          ),
        ],
      ),
    ),
  )

const lutRow = (
  h: HtmlBuilder<EditorMessage>,
  entry: LutCatalogEntry,
  selected: boolean,
  onPick: (lutId: LutId) => EditorMessage,
) =>
  h.button(
    [
      h.OnClick(onPick(entry.lut_file)),
      h.AriaLabel(`Apply ${entry.name}`),
      h.Class(
        `flex w-full items-center gap-2 rounded border px-2 py-1 text-left transition-colors ${
          selected
            ? 'border-accent bg-panel-alt'
            : 'border-transparent hover:border-muted hover:bg-panel-alt'
        }`,
      ),
    ],
    [
      h.img([
        h.Src(`/luts/${entry.thumbnail}`),
        h.Alt(entry.name),
        h.Loading('lazy'),
        h.Class('h-9 w-9 shrink-0 rounded object-cover'),
      ]),
      h.span([h.Class('flex-1 truncate text-xs text-muted')], [entry.name]),
    ],
  )
