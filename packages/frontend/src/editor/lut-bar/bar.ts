import { Option, pipe } from 'effect'
import { type Html, type HtmlBuilder, createLazy, createKeyedLazy } from 'foldkit/html'
import type { LayerId, LutId } from '@lutra/engine'
import type { LutCatalogEntry } from '../../luts/store'
import type { LutDownloadState } from '../../offline/model'
import { EditorMessage } from '../message'
import { lutName } from '../layer-meta'
import type { Model } from '../model'
import { currentLutId, lutTarget } from './target'
import { effectiveTab, groupByCategory, lookup, recentsEntries, visibleEntries } from './catalog'
import { tab } from './tab'
import { thumb } from './thumb'
import { stateFor } from '../../offline/model'

// memoization (ADR 0006)
// The bar's catalog grouping (`groupByCategory`) over ~300 entries and the
// thumb strip's `visibleEntries` + per-thumb `thumb()` calls are the heaviest
// pure work in the editor. A hover `PreviewedLut` should not recompute the
// category tabs or the filmstrip's grouped entries — only the name line.
// Hence three lazy islands: tabs (catalog+recents+activeTab), filmstrip
// (entries+thumbs+downloads), and name line (previewLut+current).
const lazyBarRoot = createLazy()
const lazyNameLine = createLazy()
const lazyTabs = createLazy()
const lazyFilmstrip = createLazy()
const lazyThumb = createKeyedLazy()
type FilmstripEntry = LutCatalogEntry
type DownloadState = LutDownloadState

const nameLineView = (
  previewLut: Model['previewLut'],
  current: Option.Option<LutId>,
  catalog: NonNullable<Model['catalog']>,
  offlineNotice: Model['offlineLutNotice'],
  h: HtmlBuilder<EditorMessage>,
): Html => {
  if (offlineNotice !== null) {
    return h.div([h.Class('truncate text-xs text-accent')], [offlineNotice])
  }
  const hovered = pipe(
    previewLut,
    Option.fromNullishOr,
    Option.flatMap((lutId) => lookup(catalog, lutId)),
  )
  const currentEntry = pipe(
    current,
    Option.flatMap((lutId) => lookup(catalog, lutId)),
  )
  const line = pipe(
    hovered,
    Option.orElse(() => currentEntry),
    Option.match({
      onSome: ({ name, category }) => `${name} · ${category}`,
      onNone: () =>
        pipe(
          current,
          Option.map((lutId) => lutName(catalog, lutId)),
          Option.getOrElse(() => ''),
        ),
    }),
  )
  return h.div([h.Class('truncate text-xs text-muted')], [line])
}

const tabsView = (
  catalog: NonNullable<Model['catalog']>,
  lutRecents: Model['lutRecents'],
  lutTab: Model['lutTab'],
  h: HtmlBuilder<EditorMessage>,
): Html => {
  const categories = groupByCategory(catalog)
  const recents = recentsEntries(catalog, lutRecents)
  const showRecents = recents.length > 0
  const activeTab = effectiveTab(catalog, lutTab, lutRecents)
  return h.div(
    [
      h.Class(
        'flex shrink-0 flex-row overflow-x-auto border-b border-border lg:w-48 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0',
      ),
    ],
    [
      ...(showRecents
        ? [tab(h, 'recents', 'Recents', recents.length, activeTab === 'recents')]
        : []),
      ...categories.map((group) =>
        tab(h, group.category, group.category, group.luts.length, activeTab === group.category),
      ),
    ],
  )
}

const filmstripView = (
  catalog: NonNullable<Model['catalog']>,
  lutTab: Model['lutTab'],
  lutRecents: Model['lutRecents'],
  lutThumbs: Model['lutThumbs'],
  lutDownloads: Model['lutDownloads'],
  online: boolean,
  current: Option.Option<LutId>,
  commitKind: 'draft' | 'layer',
  commitId: string | null,
  h: HtmlBuilder<EditorMessage>,
): Html => {
  const entries = visibleEntries(catalog, lutTab, lutRecents)
  return h.div(
    [
      h.Class('flex min-h-0 flex-1 flex-wrap content-start overflow-y-auto'),
      h.AriaLabel('LUT thumbnails'),
    ],
    entries.map((entry) =>
      lazyThumb(entry.lut_file, thumbView, [
        entry,
        lutThumbs[entry.lut_file] ?? `/luts/${entry.thumbnail}`,
        Option.contains(current, entry.lut_file),
        stateFor(lutDownloads, entry.lut_file),
        online,
        commitKind,
        commitId,
        h,
      ])!,
    ),
  )
}

const thumbView = (
  entry: FilmstripEntry,
  src: string,
  current: boolean,
  downloadState: DownloadState,
  online: boolean,
  commitKind: 'draft' | 'layer',
  commitId: string | null,
  h: HtmlBuilder<EditorMessage>,
): Html =>
  thumb(h, entry, src, current, downloadState, online, () => {
    // Commit gate — mirrors lutBar's commit closure but uses primitive args for cache stability
    // The offline gate is re-evaluated here; online/downloads are already in scope.
    // We can't fully memoize the closure, but per-thumb memoization keeps it stable
    // until the thumb's own `current`/`downloadState`/`online` changes.
    if (!online && downloadState !== 'downloaded') {
      return EditorMessage.OfflineLutUnavailable({ lutId: entry.lut_file })
    }
    // SAFETY: commitId is LayerId when commitKind is 'layer' (barView guarantees targetId non-null)
    return commitKind === 'draft'
      ? EditorMessage.ChangedDraftLut({ lutId: entry.lut_file })
      : EditorMessage.ChangedLayerLut({ id: commitId as LayerId, lutId: entry.lut_file })
  })

const barView = (
  catalog: NonNullable<Model['catalog']>,
  targetKind: 'draft' | 'layer',
  targetId: string | null,
  lutBarOpen: boolean,
  previewLut: Model['previewLut'],
  lutTab: Model['lutTab'],
  lutRecents: Model['lutRecents'],
  lutThumbs: Model['lutThumbs'],
  lutDownloads: Model['lutDownloads'],
  online: boolean,
  offlineNotice: Model['offlineLutNotice'],
  phase: Model['phase'],
  chain: Model['chain'],
  h: HtmlBuilder<EditorMessage>,
): Html => {
  const current = (() => {
    const m = {
      previewLut,
      lutTab,
      lutRecents,
      lutThumbs,
      lutDownloads,
      online,
      offlineLutNotice: offlineNotice,
      phase,
      chain,
      catalog,
      // SAFETY: narrow slice for lazy memoization — only fields the view island reads
    } as unknown as Model
    if (targetKind === 'draft') {
      return currentLutId(m, { kind: 'draft' })
    } else if (targetId !== null) {
      return currentLutId(m, { kind: 'layer', id: targetId as LayerId })
    }
    return Option.none<LutId>()
  })()

  return h.div(
    [
      h.Class(
        'flex h-[min(340px,40dvh)] shrink-0 flex-col border-t border-border bg-panel lg:h-[231px] lg:flex-row',
      ),
    ],
    [
      lazyTabs(tabsView, [catalog, lutRecents, lutTab, h])!,
      h.div(
        [h.Class('flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 px-3 py-2')],
        [
          lazyNameLine(nameLineView, [previewLut, current, catalog, offlineNotice, h])!,
          lazyFilmstrip(filmstripView, [
            catalog,
            lutTab,
            lutRecents,
            lutThumbs,
            lutDownloads,
            online,
            current,
            targetKind,
            targetId,
            h,
          ])!,
        ],
      ),
    ],
  )
}

/**
 * The bottom LUT bar (docs/adr/0002-lut-library): category tabs on the left, a
 * hover-to-preview / click-to-commit thumbnail filmstrip on the right, and a
 * name line above the strip. Replaces the drawer's accordion picker — the
 * drawer's LUT rows keep summary + strength slider, and a chevron on those
 * rows toggles this bar. Renders only while a LUT target exists, the bar is
 * open, and the catalog has loaded.
 */
export const lutBar = (h: HtmlBuilder<EditorMessage>, model: Model): Html | null => {
  const targetOpt = lutTarget(model)
  if (!model.lutBarOpen || Option.isNone(targetOpt) || model.catalog === null) {
    return null
  }
  const catalog = model.catalog
  const target = targetOpt.value
  const targetId = target.kind === 'layer' ? target.id : null
  return lazyBarRoot(barView, [
    catalog,
    target.kind,
    targetId,
    model.lutBarOpen,
    model.previewLut,
    model.lutTab,
    model.lutRecents,
    model.lutThumbs,
    model.lutDownloads,
    model.online,
    model.offlineLutNotice,
    model.phase,
    model.chain,
    h,
  ])
}
