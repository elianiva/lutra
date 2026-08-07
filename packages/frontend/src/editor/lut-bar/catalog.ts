import { Array, Option, pipe, Record } from 'effect'
import type { LutId } from '@lutra/engine'
import type { LutCatalogEntry } from '../../luts/store'

/** Group the catalog by category, preserving first-seen order. The tab
 *  column and the filmstrip content share this grouping. Array.groupBy
 *  buckets into a plain record, whose string-key insertion order IS
 *  first-seen order; Record.toEntries walks it in that order. */
export const groupByCategory = (catalog: ReadonlyArray<LutCatalogEntry>) =>
  pipe(
    catalog,
    Array.groupBy((entry) => entry.category),
    Record.toEntries,
    Array.map(([category, luts]) => ({ category, luts })),
  )

export const lookup = (catalog: ReadonlyArray<LutCatalogEntry>, lutId: LutId) =>
  Array.findFirst(catalog, (entry) => entry.lut_file === lutId)

/** The Recents tab's entries: the persisted lutIds resolved against the
 *  catalog — entries whose lutId vanished from the catalog are dropped at
 *  render (a stale reference must never render a dead thumbnail). */
export const recentsEntries = (
  catalog: ReadonlyArray<LutCatalogEntry>,
  recents: ReadonlyArray<LutId>,
): ReadonlyArray<LutCatalogEntry> =>
  pipe(
    recents,
    Array.map((lutId) => lookup(catalog, lutId)),
    Array.filter(Option.isSome),
    Array.map((entry) => entry.value),
  )
