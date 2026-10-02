import { Effect } from 'effect'
import { IndexedDbDatabase, IndexedDbVersion } from '@effect/platform-browser'
import { EditTable } from './edit/edit-table'

/**
 * The `"lutra"` database schema — one migration chain owning every object
 * store (docs/adr/0005-storage). The database name is configured at the Layer
 * (`LutraDbSchema.layer('lutra')`), and its IndexedDB version is the number of
 * versions declared here, so a shipped version is never removed.
 *
 * - **v1** creates the `edits` store (keyed by Edit id) and its `saved_at`
 *   index. Existing installs are already here.
 * - **v2** added the `collages` store, retired with the collage feature. The
 *   version stays as a no-op so databases already at v2 keep opening: the
 *   browser rejects a lower version outright, which would break the gallery
 *   of every existing install. No store is created here, so fresh installs
 *   never see `collages`; existing ones keep its rows unread until a later
 *   version drops the store.
 *
 * Only migrations after the browser's current version run, so a database is
 * never re-created — appending versions via `.add` is the extension story.
 */
const V1 = IndexedDbVersion.make(EditTable)
const V2 = IndexedDbVersion.make(EditTable)

export const LutraDbSchema = IndexedDbDatabase.make(V1, (toQuery) =>
  Effect.gen(function* LutraDbSchema() {
    yield* toQuery.createObjectStore(EditTable.tableName)
    yield* toQuery.createIndex(EditTable.tableName, 'saved_at')
  }),
).add(V2, () => Effect.void)
