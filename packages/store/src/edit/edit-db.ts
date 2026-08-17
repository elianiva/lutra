import { Effect } from 'effect'
import { IndexedDbDatabase, IndexedDbVersion } from '@effect/platform-browser'
import { EditTable } from './edit-table'

/**
 * The IndexedDB database schema/version for Edits (docs/adr/0007), built on
 * the typed table stack. The database name is `"lutra"` (configured at the
 * Layer when the schema is provided).
 *
 * Version 1 creates the `edits` object store (keyed by Edit id) and its
 * `saved_at` index on `savedAt`. The `IndexedDbDatabase.make` initializer runs
 * only during the database upgrade transaction, so fresh installs get the
 * store; later schema changes append versions via `.add`.
 */
export const EditDbSchema = IndexedDbDatabase.make(IndexedDbVersion.make(EditTable), (toQuery) =>
  Effect.gen(function* EditDbSchema() {
    yield* toQuery.createObjectStore(EditTable.tableName)
    yield* toQuery.createIndex(EditTable.tableName, 'saved_at')
  }),
)
