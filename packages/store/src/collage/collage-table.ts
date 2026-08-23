import { IndexedDbTable } from '@effect/platform-browser'
import { Collage } from './collage'

/**
 * The IndexedDB object store holding Collage records (docs/adr/0009-collage).
 *
 * One row per Collage, keyed by the Collage uuid (`keyPath: 'id'`). The row
 * schema is the `Collage` schema itself — the record is ids + layout numbers
 * only, so it commits as one small row.
 *
 * No secondary index: like the edits table's list, the menu section scans
 * the table and sorts by `savedAt` in memory; nothing queries collages by
 * another key.
 */
export const CollageTable = IndexedDbTable.make({
  keyPath: 'id',
  name: 'collages',
  schema: Collage,
} as const)
