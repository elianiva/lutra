import { Effect, Layer, Option } from 'effect'
import { EditStore } from './edit-store'
import type { Edit } from './edit'
import type { EditSummary } from './edit-summary'
import { StoreError } from './store-error'

/**
 * A placeholder backend that satisfies the {@link EditStore} contract with no
 * persistence — `list()` always returns an empty grid and reads return
 * `Option.None`.
 *
 * This ships only so the frontend foundation (root submodel + Gallery +
 * Editor) can compile and run against a real seam shape before the IndexedDB
 * backend is implemented (ADR 0008 sequencing: foundation first). It is the
 * seam standing in for its own future self — the gallery renders "no edits
 * yet", which is the correct UI for a fresh install anyway. It is **not** a
 * mock smuggling fake data in; it persists nothing.
 *
 * @see `./indexeddb.ts` for the real IndexedDB `EditStoreLive` to come.
 */
export const EditStoreNoopLive: Layer.Layer<EditStore> = Layer.succeed(
  EditStore,
  EditStore.of({
    save: () =>
      Effect.fail(new StoreError({ message: 'storage not implemented yet', cause: undefined })),
    load: (): Effect.Effect<Option.Option<Edit>, StoreError> => Effect.succeed(Option.none()),
    list: (): Effect.Effect<ReadonlyArray<EditSummary>, StoreError> => Effect.succeed([]),
    delete: () => Effect.void,
    clearAll: () => Effect.void,
  }),
)
