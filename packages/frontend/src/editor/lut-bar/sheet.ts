import { Option, pipe } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import type { LutId } from '@lutra/engine'
import type { LayerId } from '@lutra/engine'
import type { LutCatalogEntry } from '../../luts/store'
import { EditorMessage } from '../message'
import type { Model } from '../model'
import { stateFor } from '../../offline/model'
import { lutName } from '../layer-meta'
import { effectiveTab, groupByCategory, lookup, recentsEntries, visibleEntries } from './catalog'

/**
 * The stock contact sheet (docs/adr/0013-materials): the LUT library inside the
 * inspector's well, as a contact sheet — category chips on top, a 4-column grid
 * of framed thumbnails below, the hovered or committed stock named last.
 *
 * Hover previews (`PreviewedLut`), click commits (`ChangedDraftLut` /
 * `ChangedLayerLut`) — the same contract the filmstrip had (docs/adr/0002-lut-library),
 * unchanged by the layout.
 */
export type LutSheetSlice = Pick<
  Model,
  | 'catalog'
  | 'previewLut'
  | 'lutTab'
  | 'lutRecents'
  | 'lutThumbs'
  | 'lutDownloads'
  | 'online'
  | 'offlineLutNotice'
>

type CommitTarget = Readonly<{ kind: 'draft' }> | Readonly<{ kind: 'layer'; id: LayerId }>

export const lutSheet = (
  h: HtmlBuilder<EditorMessage>,
  slice: LutSheetSlice,
  target: CommitTarget,
  current: Option.Option<LutId>,
): Html => {
  const catalog = slice.catalog ?? []
  const categories = groupByCategory(catalog)
  const recents = recentsEntries(catalog, slice.lutRecents)
  const activeTab = effectiveTab(catalog, slice.lutTab, slice.lutRecents)
  const entries = visibleEntries(catalog, slice.lutTab, slice.lutRecents)

  const commit = (entry: LutCatalogEntry): EditorMessage => {
    const download = stateFor(slice.lutDownloads, entry.lut_file)
    if (!slice.online && download !== 'downloaded') {
      return EditorMessage.OfflineLutUnavailable({ lutId: entry.lut_file })
    }
    return target.kind === 'draft'
      ? EditorMessage.ChangedDraftLut({ lutId: entry.lut_file })
      : EditorMessage.ChangedLayerLut({ id: target.id, lutId: entry.lut_file })
  }

  const chip = (key: string, label: string, active: boolean) =>
    h.button(
      [
        h.Class(
          `rounded-full px-2 py-1 text-[8px] uppercase tracking-[0.16em] transition-colors ${
            active ? 'bg-s2 text-ink' : 'text-dim hover:text-ink'
          }`,
        ),
        h.OnClick(EditorMessage.SelectedLutTab({ tab: key })),
        h.AriaPressed(String(active)),
      ],
      [label],
    )

  const hovered = pipe(
    Option.fromNullishOr(slice.previewLut),
    Option.flatMap((lutId) => lookup(catalog, lutId)),
  )
  const committed = pipe(
    current,
    Option.flatMap((lutId) => lookup(catalog, lutId)),
  )
  const nameLine = pipe(
    hovered,
    Option.orElse(() => committed),
    Option.map((entry) => `${entry.name} · ${entry.category}`),
    Option.getOrElse(() =>
      pipe(
        current,
        Option.map((lutId) => lutName(catalog, lutId)),
        Option.getOrElse(() => 'No stock selected'),
      ),
    ),
  )

  return h.div(
    [h.Class('flex flex-col gap-3')],
    [
      h.div(
        [h.Class('flex flex-wrap items-center gap-1'), h.AriaLabel('Stock categories')],
        [
          ...(recents.length > 0 ? [chip('recents', 'Recents', activeTab === 'recents')] : []),
          ...categories.map((group) =>
            chip(group.category, group.category, activeTab === group.category),
          ),
        ],
      ),
      h.div(
        [h.Class('grid grid-cols-4 gap-x-2 gap-y-3'), h.AriaLabel('LUT thumbnails')],
        entries.map((entry) => {
          const src = slice.lutThumbs[entry.lut_file] ?? `/luts/${entry.thumbnail}`
          const selected = Option.contains(current, entry.lut_file)
          const unavailable =
            !slice.online && stateFor(slice.lutDownloads, entry.lut_file) !== 'downloaded'
          return h.button(
            [
              h.Key(entry.lut_file),
              h.Class('group flex flex-col gap-1 text-left'),
              h.OnClick(commit(entry)),
              h.OnMouseEnter(EditorMessage.PreviewedLut({ lutId: entry.lut_file })),
              h.OnMouseLeave(EditorMessage.PreviewedLut({ lutId: null })),
              h.AriaPressed(String(selected)),
              h.AriaLabel(
                unavailable
                  ? `Apply ${entry.name} — not downloaded, needs a connection`
                  : `Apply ${entry.name}`,
              ),
              h.Title(unavailable ? `${entry.name} — not downloaded yet` : entry.name),
            ],
            [
              h.img([
                h.Src(src),
                h.Alt(entry.name),
                h.Loading('lazy'),
                h.Class(
                  `aspect-square w-full rounded-lg object-cover transition-[opacity,translate,box-shadow] duration-150 ease-out ${
                    selected
                      ? 'opacity-100 shadow-[0_0_0_2px_var(--mat-accent),0_8px_20px_-8px_var(--mat-halo)]'
                      : 'opacity-70 group-hover:-translate-y-0.5 group-hover:opacity-100 group-hover:shadow-[0_8px_18px_-8px_var(--mat-shadow-a)]'
                  } ${unavailable ? 'opacity-30' : ''}`,
                ),
              ]),
              h.span(
                [
                  h.Class(
                    `flex flex-col gap-0.5 text-[9px] leading-none ${
                      selected ? 'text-ink' : 'text-dim'
                    }`,
                  ),
                ],
                [
                  h.span([h.Class('truncate'), h.Title(entry.name)], [entry.name]),
                  ...(unavailable
                    ? [h.span([h.Class('truncate text-[8px] text-dim')], ['not downloaded'])]
                    : []),
                ],
              ),
            ],
          )
        }),
      ),
      h.div(
        [h.Class('flex items-baseline justify-between gap-2 border-t border-transparent pt-1')],
        [
          h.span(
            [
              h.Class(
                slice.offlineLutNotice === null ? 'micro truncate' : 'micro truncate text-accent',
              ),
            ],
            [slice.offlineLutNotice ?? nameLine],
          ),
          h.span([h.Class('micro tnum flex-none')], [`${String(entries.length)}`]),
        ],
      ),
    ],
  )
}
