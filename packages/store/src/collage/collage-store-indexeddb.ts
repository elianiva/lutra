import { Effect, Layer, Option } from 'effect'
import type { IndexedDbDatabase } from '@effect/platform-browser'
import { IndexedDb } from '@effect/platform-browser'
import { LutraDbSchema } from '../db'
import { CollageTable } from './collage-table'
import type { Collage } from './collage'
import type { CollageId } from './collage-id'
import { CollageStore } from './collage-store'
import type { CollageStoreContract } from './collage-store'
import { StoreError } from '../edit/store-error'

const mapQueryError = (cause: unknown): StoreError =>
  new StoreError({ cause, message: 'collage store query failed' })

const unavailable = (reason: string): StoreError =>
  new StoreError({ cause: undefined, message: reason })

/**
 * A store that rejects every operation with a `StoreError` — the fallback
 * served when the IndexedDB database cannot be opened (blocked, private
 * mode, quota, missing backend). The app stays alive and the collage
 * surfaces surface the failure rather than silently dropping data.
 */
const CollageStoreUnavailable = (reason: string): CollageStoreContract =>
  CollageStore.of({
    clearAll: () => Effect.fail(unavailable(reason)),
    delete: () => Effect.fail(unavailable(reason)),
    list: () => Effect.fail(unavailable(reason)),
    load: () => Effect.fail(unavailable(reason)),
    save: () => Effect.fail(unavailable(reason)),
  })

/**
 * The IndexedDB local backend for {@link Collage}s (docs/adr/0030). One row
 * per Collage in the `collages` object store, keyed by id; the menu section's
 * list is the whole table scanned and sorted by `savedAt` in memory.
 *
 * A Layer that requires the `IndexedDbDatabase` service — fuse it with the
 * database schema (see {@link CollageStoreIndexedDb}) to provide a working
 * store.
 */
export const CollageStoreLive: Layer.Layer<
  CollageStore,
  StoreError,
  IndexedDbDatabase.IndexedDbDatabase
> = Layer.effect(
  CollageStore,
  Effect.gen(function* CollageStoreLive() {
    const builder = yield* LutraDbSchema
    const table = builder.from(CollageTable.tableName)

    const save = (collage: Collage): Effect.Effect<void, StoreError> =>
      table.upsert(collage).pipe(Effect.asVoid, Effect.mapError(mapQueryError))

    const load = (id: CollageId): Effect.Effect<Option.Option<Collage>, StoreError> =>
      table
        .select()
        .equals(id)
        .pipe(
          Effect.map((rows) => Option.fromIterable(rows)),
          Effect.mapError(mapQueryError),
        )

    const list = (): Effect.Effect<readonly Collage[], StoreError> =>
      table.select().pipe(
        Effect.map((rows) => [...rows].sort((a, b) => b.savedAt - a.savedAt)),
        Effect.mapError(mapQueryError),
      )

    const del = (id: CollageId): Effect.Effect<void, StoreError> =>
      table.delete().equals(id).pipe(Effect.asVoid, Effect.mapError(mapQueryError))

    const clearAll = (): Effect.Effect<void, StoreError> =>
      table.clear.pipe(Effect.mapError(mapQueryError))

    return CollageStore.of({ clearAll, delete: del, list, load, save })
  }),
)

/**
 * The ready-to-provide IndexedDB backend: the `CollageStoreLive` fused with
 * the shared `"lutra"` database schema and the browser `IndexedDb`
 * primitives. Its error type is `never`: if the database cannot be opened,
 * the app degrades to a store that rejects every operation with a
 * `StoreError`. Wire this into the app resource stack alongside
 * `EditStoreIndexedDb`.
 */
export const CollageStoreIndexedDb: Layer.Layer<CollageStore> = CollageStoreLive.pipe(
  Layer.provide(LutraDbSchema.layer('lutra')),
  Layer.provide(IndexedDb.layerWindow),
  Layer.catch((error) =>
    Layer.succeed(
      CollageStore,
      CollageStoreUnavailable(`could not open the collage database: ${error.message}`),
    ),
  ),
)
