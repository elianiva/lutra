import { Effect, Layer } from 'effect'
import type { IndexedDbDatabase } from '@effect/platform-browser'
import { LutraDbSchema } from '../db'
import { indexedDbStoreLayer, tableCrud } from '../store-support'
import { EditTable } from './edit-table'
import type { Edit as EditType } from './edit'
import type { EditSummary } from './edit-summary'
import { EditStore } from './edit-store'
import type { StoreError } from './store-error'

/**
 * The IndexedDB local backend for {@link Edit}s (docs/adr/0005-storage). One
 * row per Edit in the `edits` object store, keyed by id; the gallery list is
 * the whole table scanned and projected to summaries, newest-first (see
 * `tableCrud`).
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
  Effect.gen(function* EditStoreLive() {
    const builder = yield* LutraDbSchema
    const table = builder.from(EditTable.tableName)

    return EditStore.of(
      tableCrud({
        label: 'edit',
        table,
        toSummary: (edit: EditType): EditSummary => ({
          byteLength: edit.thumbnail.byteLength,
          chain: edit.chain,
          id: edit.id,
          savedAt: edit.savedAt,
          thumbnail: edit.thumbnail,
        }),
      }),
    )
  }),
)

/**
 * The ready-to-provide IndexedDB backend: the `EditStoreLive` fused with the
 * typed database schema opened against the `"lutra"` database name and the
 * browser `IndexedDb` primitives. Its error type is `never`: if the database
 * cannot be opened, the app degrades to a store that rejects every operation
 * with a `StoreError` — the gallery shows its error state instead of the app
 * failing to boot. Wire this into the app resource stack.
 */
export const EditStoreIndexedDb: Layer.Layer<EditStore> = indexedDbStoreLayer(
  EditStore,
  EditStoreLive,
  (ops) => EditStore.of(ops),
  'edit',
)
