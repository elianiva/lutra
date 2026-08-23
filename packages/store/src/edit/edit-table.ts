import { IndexedDbTable } from '@effect/platform-browser'
import { Edit } from './edit'

/**
 * The single IndexedDB object store holding Edit records (docs/adr/0005-storage).
 *
 * Design notes:
 * - **One row per Edit**, keyed by the Edit uuid (`keyPath: 'id'`), with an index
 *   on `savedAt` for the gallery's time-ordered grid. This is the typed-table
 *   shape ADR 0005's *migration trigger* anticipated: a flat `KeyValueStore`
 *   (`layerIndexedDb`) cannot enumerate its keys, so it cannot implement the
 *   seam's `list()` — the moment the gallery needs the whole grid, a table
 *   with real row scans is required.
 * - The row schema is the `Edit` schema itself, so a whole self-contained Edit
 *   (chain + source bytes + thumbnail) commits as one row.
 */
export const EditTable = IndexedDbTable.make({
  indexes: {
    saved_at: 'savedAt',
  },
  keyPath: 'id',
  name: 'edits',
  schema: Edit,
} as const)
