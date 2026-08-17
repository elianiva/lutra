import type { Effect, Option } from 'effect'
import { Context } from 'effect'
import type { Edit } from './edit'
import type { EditSummary } from './edit-summary'
import type { EditId } from './edit-id'
import type { StoreError } from './store-error'

/**
 * The swappable storage backend for {@link Edit}s. Aggregate-level and
 * self-contained: each Edit is one record, backend-agnostic by design
 * (docs/adr/0007, 0008). A local IndexedDB implementation and a future
 * online/cloud implementation both satisfy this contract; the frontend
 * depends only on the service type.
 */
export interface EditStoreContract {
  /** Persist an Edit, upserting by id (Save updates in place, Save as forks a new id). */
  readonly save: (edit: Edit) => Effect.Effect<void, StoreError>
  /** Load a full Edit (source bytes included). A missing id is `Option.None`, not an error. */
  readonly load: (id: EditId) => Effect.Effect<Option.Option<Edit>, StoreError>
  /** List Edit summaries (source bytes excluded) for the gallery grid. */
  readonly list: () => Effect.Effect<readonly EditSummary[], StoreError>
  /** Delete one Edit by id. Unknown id is a no-op. */
  readonly delete: (id: EditId) => Effect.Effect<void, StoreError>
  /** Delete every Edit (the gallery/Options "Clear all" action). */
  readonly clearAll: () => Effect.Effect<void, StoreError>
}

/**
 * The {@link Edit} storage service. Implementations are swappable behind this
 * boundary: IndexedDB `EditStoreLive` (v1, docs/adr/0007) and a future
 * server/cloud backend. The frontend consumes only this service type.
 */
export class EditStore extends Context.Service<EditStore, EditStoreContract>()('EditStore') {}
