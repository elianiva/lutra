import { Array, Option, pipe } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import type { LutId } from '@lutra/engine'
import type { EditorMessage } from '../message'
import { ChangedDraftLut, ChangedLayerLut } from '../message'
import { lutName } from '../layer-meta'
import type { Model } from '../model'
import { currentLutId, lutTarget } from './target'
import { groupByCategory, lookup, recentsEntries } from './catalog'
import { tab } from './tab'
import { thumb } from './thumb'
import { LutStripWheel } from './wheel'

/**
 * The bottom LUT bar (docs/adr/0012): category tabs on the left, a
 * hover-to-preview / click-to-commit thumbnail filmstrip on the right, and a
 * name line above the strip. Replaces the drawer's accordion picker — the
 * drawer's LUT rows keep summary + strength slider, and a chevron on those
 * rows toggles this bar. Renders only while a LUT target exists, the bar is
 * open, and the catalog has loaded.
 */
export const lutBar = (h: HtmlBuilder<EditorMessage>, model: Model) =>
  pipe(
    // Renders only while the bar is open, a LUT target exists, and the
    // catalog has loaded.
    Option.all([Option.fromNullishOr(model.catalog), lutTarget(model)]),
    Option.filter(() => model.lutBarOpen),
    Option.map(([catalog, target]) => {
      const categories = groupByCategory(catalog)
      const recents = recentsEntries(catalog, model.lutRecents)
      const showRecents = recents.length > 0
      // A stale `lutTab: 'recents'` (the list emptied since) falls back to
      // the first catalog category for content and highlight; an empty
      // catalog degrades to the stale tab's empty filmstrip instead of
      // crashing on a missing "first" category.
      const activeTab =
        model.lutTab === 'recents' && !showRecents
          ? pipe(
              categories,
              Array.head,
              Option.map(({ category }) => category),
              Option.getOrElse(() => model.lutTab),
            )
          : model.lutTab
      const entries =
        model.lutTab === 'recents' && showRecents
          ? recents
          : pipe(
              categories,
              Array.findFirst((group) => group.category === activeTab),
              Option.map((group) => group.luts),
              Option.getOrElse(() => []),
            )

      const current = currentLutId(model, target)
      const hovered = pipe(
        model.previewLut,
        Option.fromNullishOr,
        Option.flatMap((lutId) => lookup(catalog, lutId)),
      )

      // The name line: the hovered entry while hovering, else the target's
      // current LUT — one live label, no tooltip latency (`title` stays as
      // backup on the thumbs).
      const currentEntry = pipe(
        current,
        Option.flatMap((lutId) => lookup(catalog, lutId)),
      )
      const nameLine = pipe(
        hovered,
        Option.orElse(() => currentEntry),
        Option.match({
          onSome: ({ name, category }) => `${name} · ${category}`,
          // A stale current lutId (gone from the catalog) falls back to the
          // bare file name.
          onNone: () =>
            pipe(
              current,
              Option.map((lutId) => lutName(catalog, lutId)),
              Option.getOrElse(() => ''),
            ),
        }),
      )

      // The bar is the only dispatcher of the commit messages (the drawer
      // accordion is gone): a draft target commits ChangedDraftLut, a chain
      // target ChangedLayerLut.
      const commit = (lutId: LutId): EditorMessage =>
        target.kind === 'draft'
          ? ChangedDraftLut({ lutId })
          : ChangedLayerLut({ id: target.id, lutId })

      return h.div(
        [h.Class('flex shrink-0 border-t border-border bg-panel')],
        [
          // Left column: category tabs (Recents only when non-empty), with
          // counts for the catalog categories.
          h.div(
            [h.Class('flex w-48 shrink-0 flex-col border-r border-border')],
            [
              ...(showRecents
                ? [tab(h, 'recents', 'Recents', recents.length, activeTab === 'recents')]
                : []),
              ...categories.map((group) =>
                tab(
                  h,
                  group.category,
                  group.category,
                  group.luts.length,
                  activeTab === group.category,
                ),
              ),
            ],
          ),
          // Right column: name line + filmstrip.
          h.div(
            [h.Class('flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2')],
            [
              h.div([h.Class('truncate text-xs text-muted')], [nameLine]),
              h.div(
                [
                  h.Class('flex flex-wrap'),
                  h.AriaLabel('LUT thumbnails'),
                  h.OnMount(LutStripWheel()),
                ],
                entries.map((entry) =>
                  thumb(h, entry, Option.contains(current, entry.lut_file), () =>
                    commit(entry.lut_file),
                  ),
                ),
              ),
            ],
          ),
        ],
      )
    }),
    Option.getOrNull,
  )
