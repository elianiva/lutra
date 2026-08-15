import { Effect, Layer, Option } from 'effect'
import { IndexedDb, IndexedDbDatabase } from '@effect/platform-browser'
import { EditDbSchema } from './edit-db'
import { EditTable } from './edit-table'
import { type Edit as EditType } from './edit'
import { EditSummary } from './edit-summary'
import type { EditId } from './edit-id'
import { EditStore, type EditStoreShape } from './edit-store'
import { StoreError } from './store-error'

const mapQueryError = (error: unknown): StoreError =>
  new StoreError({ message: 'edit store query failed', cause: error })

const unavailable = (reason: string): StoreError =>
  new StoreError({ message: reason, cause: undefined })

/**
 * A store that rejects every operation with a `StoreError` — the fallback
 * served when the IndexedDB database cannot be opened (blocked, private
 * mode, quota, missing backend). The app stays alive and the gallery surfaces
 * the failure rather than silently dropping data.
 */
const EditStoreUnavailable = (reason: string): EditStoreShape =>
  EditStore.of({
    save: () => Effect.fail(unavailable(reason)),
    load: () => Effect.fail(unavailable(reason)),
    list: () => Effect.fail(unavailable(reason)),
    delete: () => Effect.fail(unavailable(reason)),
    clearAll: () => Effect.fail(unavailable(reason)),
  })

/**
 * The IndexedDB local backend for {@link Edit}s (docs/adr/0007, 0008). One
 * row per Edit in the `edits` object store, keyed by id; the gallery list is
 * the whole table scanned and sorted by `savedAt` in memory (the store isn't a
 * relational orderer).
 *
 * A Layer that requires the `IndexedDbDatabase` service — fuse it with the
 * database schema (see {@link EditStoreIndexedDb}) to provide a working store.
 */
export const EditStoreLive: Layer.Layer<
  EditStore,
  StoreError,
  IndexedDbDatabase.IndexedDbDatabase
> = Layer.effect(
  EditStore,
  Effect.gen(function* () {
    const builder = yield* EditDbSchema
    const table = builder.from(EditTable.tableName)

    const toSummary = (edit: EditType): EditSummary => ({
      id: edit.id,
      chain: edit.chain,
      thumbnail: edit.thumbnail,
      byteLength: edit.thumbnail.byteLength,
      savedAt: edit.savedAt,
    })

    const save = (edit: EditType): Effect.Effect<void, StoreError> =>
      table.upsert(edit).pipe(Effect.asVoid, Effect.mapError(mapQueryError))

    const load = (id: EditId): Effect.Effect<Option.Option<EditType>, StoreError> =>
      table
        .select()
        .equals(id)
        .pipe(
          Effect.map((rows) => Option.fromIterable(rows)),
          Effect.mapError(mapQueryError),
        )

    const list = (): Effect.Effect<ReadonlyArray<EditSummary>, StoreError> =>
      table.select().pipe(
        Effect.map((rows) => rows.map(toSummary).sort((a, b) => b.savedAt - a.savedAt)),
        Effect.mapError(mapQueryError),
      )

    const del = (id: EditId): Effect.Effect<void, StoreError> =>
      table.delete().equals(id).pipe(Effect.asVoid, Effect.mapError(mapQueryError))

    const clearAll = (): Effect.Effect<void, StoreError> =>
      table.clear.pipe(Effect.mapError(mapQueryError))

    return EditStore.of({ save, load, list, delete: del, clearAll })
  }),
)

/**
 * The ready-to-provide IndexedDB backend: the `EditStoreLive` fused with the
 * typed database schema opened against the `"lutra"` database name and the
 * browser `IndexedDb` primitives. Its error type is `never`: if the database
 * cannot be opened (blocked, private/incognito, quota), the app degrades to a
 * store that rejects every operation with a `StoreError` — the gallery shows
 * its error state instead of the app failing to boot. Wire this into the app
 * resource stack.
 */
export const EditStoreIndexedDb: Layer.Layer<EditStore, never> = EditStoreLive.pipe(
  Layer.provide(EditDbSchema.layer('lutra')),
  Layer.provide(IndexedDb.layerWindow),
  Layer.catch((error) =>
    Layer.succeed(
      EditStore,
      EditStoreUnavailable(`could not open the edit database: ${error.message}`),
    ),
  ),
)
