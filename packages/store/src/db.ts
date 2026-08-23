import { Effect } from 'effect'
import { IndexedDbDatabase, IndexedDbVersion } from '@effect/platform-browser'
import { CollageTable } from './collage/collage-table'
import { EditTable } from './edit/edit-table'

/**
 * The `"lutra"` database schema — one migration chain owning every object
 * store (docs/adr/0005-storage, docs/adr/0009-collage). The database name is configured at the Layer
 * (`LutraDbSchema.layer('lutra')`).
 *
 * - **v1** creates the `edits` store (keyed by Edit id) and its `saved_at`
 *   index. Existing installs are already here.
 * - **v2** adds the `collages` store (docs/adr/0009-collage): fresh installs run
 *   v0→v1→v2 back-to-back during their first open; existing v1 databases
 *   upgrade through the same chain, so both paths end in the same shape.
 *
 * Only migrations after the browser's current version run, so a database is
 * never re-created — appending versions via `.add` is the extension story.
 */
const V1 = IndexedDbVersion.make(EditTable)
const V2 = IndexedDbVersion.make(EditTable, CollageTable)

export const LutraDbSchema = IndexedDbDatabase.make(V1, (toQuery) =>
  Effect.gen(function* LutraDbSchema() {
    yield* toQuery.createObjectStore(EditTable.tableName)
    yield* toQuery.createIndex(EditTable.tableName, 'saved_at')
  }),
).add(V2, (_fromQuery, toQuery) =>
  Effect.gen(function* AddCollages() {
    yield* toQuery.createObjectStore(CollageTable.tableName)
  }),
)
