import { Effect, Layer, identity } from 'effect'
import type { IndexedDbDatabase } from '@effect/platform-browser'
import { LutraDbSchema } from '../db'
import { indexedDbStoreLayer, tableCrud } from '../store-support'
import { CollageTable } from './collage-table'
import { CollageStore } from './collage-store'
import type { StoreError } from '../edit/store-error'

/**
 * The IndexedDB local backend for {@link Collage}s (docs/adr/0009-collage). One row
 * per Collage in the `collages` object store, keyed by id; the menu section's
 * list is the whole table scanned and sorted newest-first (see `tableCrud`).
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

    return CollageStore.of(tableCrud({ label: 'collage', table, toSummary: identity }))
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
export const CollageStoreIndexedDb: Layer.Layer<CollageStore> = indexedDbStoreLayer(
  CollageStore,
  CollageStoreLive,
  (ops) => CollageStore.of(ops),
  'collage',
)
