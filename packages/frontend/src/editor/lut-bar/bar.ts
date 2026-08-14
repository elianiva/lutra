import { Option, pipe } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import type { LutId } from '@lutra/engine'
import type { EditorMessage } from '../message'
import { ChangedDraftLut, ChangedLayerLut, OfflineLutUnavailable } from '../message'
import { lutName } from '../layer-meta'
import type { Model } from '../model'
import { currentLutId, lutTarget } from './target'
import { effectiveTab, groupByCategory, lookup, recentsEntries, visibleEntries } from './catalog'
import { tab } from './tab'
import { thumb } from './thumb'
import { stateFor } from '../../offline/model'

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
      // What the filmstrip shows, shared with the thumb-generation trigger
      // (docs/adr/0013): a stale `lutTab: 'recents'` (the list emptied
      // since) falls back to the first catalog category for content and
      // highlight; an empty catalog degrades to the stale tab's empty
      // filmstrip instead of crashing on a missing "first" category.
      const categories = groupByCategory(catalog)
      const recents = recentsEntries(catalog, model.lutRecents)
      const showRecents = recents.length > 0
      const activeTab = effectiveTab(catalog, model.lutTab, model.lutRecents)
      const entries = visibleEntries(catalog, model.lutTab, model.lutRecents)

      const current = currentLutId(model, target)
      const hovered = pipe(
        model.previewLut,
        Option.fromNullishOr,
        Option.flatMap((lutId) => lookup(catalog, lutId)),
      )

      // The name line: the transient offline notice while one is showing
      // (an undownloaded row was clicked offline), else the hovered entry
      // while hovering, else the target's current LUT — one live label, no
      // tooltip latency (`title` stays as backup on the thumbs).
      const currentEntry = pipe(
        current,
        Option.flatMap((lutId) => lookup(catalog, lutId)),
      )
      const nameLine = model.offlineLutNotice ??
        pipe(
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
      // target ChangedLayerLut. The offline library gate (docs/adr/0015):
      // while the device is offline, a cube that isn't cached yet can't be
      // applied — the click becomes the distinct connect-once notice instead
      // of a silent fetch failure. (While online the click commits as
      // usual — the app fetches the cube on demand and cache-as-you-go
      // mirrors it.)
      const commit = (lutId: LutId): EditorMessage => {
        if (!model.online && stateFor(model.lutDownloads, lutId) !== 'downloaded') {
          return OfflineLutUnavailable({ lutId })
        }
        return target.kind === 'draft'
          ? ChangedDraftLut({ lutId })
          : ChangedLayerLut({ id: target.id, lutId })
      }

      // Fixed-height bar: exactly two rows of 96px thumbs + the name line
      // (231 = 1px border + 16px name + 6px gap + 16px padding + 192px
      // strip). The tab list and the filmstrip scroll independently inside
      // it, so the bar's height never follows the row count (Instant Pro
      // alone is 7 rows at 1280px).
      return h.div(
        [h.Class('flex h-[231px] shrink-0 border-t border-border bg-panel')],
        [
          // Left column: category tabs (Recents only when non-empty), with
          // counts for the catalog categories. The list scrolls when it
          // outgrows the fixed bar height.
          h.div(
            [h.Class('flex w-48 shrink-0 flex-col overflow-y-auto border-r border-border')],
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
              h.div(
                [
                  h.Class(
                    `truncate text-xs ${model.offlineLutNotice === null ? 'text-muted' : 'text-accent'}`,
                  ),
                ],
                [nameLine],
              ),
              // The filmstrip: rows wrap as before, but the container is
              // capped at two visible rows — the overflow scrolls
              // vertically, natively (no wheel mount; a JS horizontal
              // handler would only block the vertical gesture).
              h.div(
                [
                  h.Class('flex min-h-0 flex-1 flex-wrap content-start overflow-y-auto'),
                  h.AriaLabel('LUT thumbnails'),
                ],
                entries.map((entry) =>
                  thumb(
                    h,
                    entry,
                    // The per-photo preview (docs/adr/0013) once it has
                    // rendered; the vendored generic jpg is the placeholder
                    // and the failure fallback.
                    model.lutThumbs[entry.lut_file] ?? `/luts/${entry.thumbnail}`,
                    Option.contains(current, entry.lut_file),
                    stateFor(model.lutDownloads, entry.lut_file),
                    model.online,
                    () => commit(entry.lut_file),
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
