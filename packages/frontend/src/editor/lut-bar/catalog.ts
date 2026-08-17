import { Array, Option, pipe, Record } from 'effect'
import type { LutId } from '@lutra/engine'
import type { LutCatalogEntry } from '../../luts/store'

/** Group the catalog by category, preserving first-seen order. The tab
 *  column and the filmstrip content share this grouping. Array.groupBy
 *  buckets into a plain record, whose string-key insertion order IS
 *  first-seen order; Record.toEntries walks it in that order. */
export const groupByCategory = (catalog: readonly LutCatalogEntry[]) =>
  pipe(
    catalog,
    Array.groupBy((entry) => entry.category),
    Record.toEntries,
    Array.map(([category, luts]) => ({ category, luts })),
  )

export const lookup = (catalog: readonly LutCatalogEntry[], lutId: LutId) =>
  Array.findFirst(catalog, (entry) => entry.lut_file === lutId)

/** The bar's effective tab: 'recents' falls back to the first catalog
 *  category while the recents list is empty (the bar hides the Recents tab
 *  in that case). An empty catalog keeps the stale tab (the bar degrades to
 *  an empty strip instead of crashing on a missing "first" category). */
export const effectiveTab = (
  catalog: readonly LutCatalogEntry[],
  lutTab: string,
  recents: readonly LutId[],
): string => {
  if (lutTab === 'recents' && recents.length === 0) {
    return pipe(
      catalog,
      Array.head,
      Option.map(({ category }) => category),
      Option.getOrElse(() => lutTab),
    )
  }
  return lutTab
}

/** The entries the bar's filmstrip shows for the given tab: the resolved
 *  recents while the Recents tab is active and non-empty, else the active
 *  group's entries ([] for a stale/unknown tab). The thumb-generation
 *  trigger derives its target set from this (docs/adr/0013), so generation
 *  and render always agree on what is visible. */
export const visibleEntries = (
  catalog: readonly LutCatalogEntry[],
  lutTab: string,
  recents: readonly LutId[],
): readonly LutCatalogEntry[] => {
  if (lutTab === 'recents' && recents.length > 0) {
    return recentsEntries(catalog, recents)
  }
  const tab = effectiveTab(catalog, lutTab, recents)
  return pipe(
    catalog,
    groupByCategory,
    Array.findFirst((group) => group.category === tab),
    Option.map((group) => group.luts),
    Option.getOrElse(() => []),
  )
}

/** The Recents tab's entries: the persisted lutIds resolved against the
 *  catalog — entries whose lutId vanished from the catalog are dropped at
 *  render (a stale reference must never render a dead thumbnail). */
export const recentsEntries = (
  catalog: readonly LutCatalogEntry[],
  recents: readonly LutId[],
): readonly LutCatalogEntry[] =>
  pipe(
    recents,
    Array.map((lutId) => lookup(catalog, lutId)),
    Array.filter(Option.isSome),
    Array.map((entry) => entry.value),
  )
