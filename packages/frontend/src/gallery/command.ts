import { Effect } from 'effect'
import { Command } from 'foldkit'
import { EditStore, EditIdSchema, StoreError } from '@lutra/store'
import { EditsListed, ListFailed, EditDeleted, DeleteFailed } from './message'

/**
 * Fetch the gallery grid (`EditStore.list`): the Edit summaries, source bytes
 * excluded. A backend failure surfaces as `ListFailed` so the grid can show
 * an error state. The no-op backend returns `[]` during the foundation slice.
 */
export const ListEdits = Command.define('ListEdits', {
  messages: [EditsListed, ListFailed],
  execute: Effect.gen(function* () {
    const store = yield* EditStore
    const summaries = yield* store.list()
    return EditsListed({ summaries })
  }).pipe(
    Effect.catchIf(
      (err): err is StoreError => err instanceof StoreError,
      (err) => Effect.succeed(ListFailed({ error: err.message })),
    ),
  ),
})

/**
 * Delete one Edit by id (`EditStore.delete`); the caller re-lists to reflect
 * the smaller grid. An unknown id is a no-op. A backend failure surfaces as
 * `DeleteFailed`.
 */
export const DeleteEdit = Command.define('DeleteEdit', {
  args: { id: EditIdSchema },
  messages: [EditDeleted, DeleteFailed],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const store = yield* EditStore
      yield* store.delete(id)
      return EditDeleted()
    }).pipe(
      Effect.catchIf(
        (err): err is StoreError => err instanceof StoreError,
        (err) => Effect.succeed(DeleteFailed({ error: err.message })),
      ),
    ),
})
