import type { Effect, Option } from 'effect'
import { Context } from 'effect'
import type { Collage } from './collage'
import type { CollageId } from './collage-id'
import type { StoreError } from '../edit/store-error'

/**
 * The swappable storage backend for {@link Collage}s — the same seam shape
 * as the EditStore (docs/adr/0030). A local IndexedDB implementation and a
 * future online/cloud implementation both satisfy this contract; the
 * frontend depends only on the service type.
 */
export interface CollageStoreContract {
  /** Persist a Collage, upserting by id (creation and every auto-save). */
  readonly save: (collage: Collage) => Effect.Effect<void, StoreError>
  /** Load a full Collage. A missing id is `Option.None`, not an error. */
  readonly load: (id: CollageId) => Effect.Effect<Option.Option<Collage>, StoreError>
  /** List every saved Collage, newest first (the main menu's section). */
  readonly list: () => Effect.Effect<readonly Collage[], StoreError>
  /** Delete one Collage by id. Unknown id is a no-op. */
  readonly delete: (id: CollageId) => Effect.Effect<void, StoreError>
  /** Delete every Collage. */
  readonly clearAll: () => Effect.Effect<void, StoreError>
}

/**
 * The {@link Collage} storage service (docs/adr/0030). Implementations are
 * swappable behind this boundary: IndexedDB `CollageStoreLive` (v1) and a
 * future server/cloud backend.
 *
 * There is no separate summary type: an Edit's summary exists to strip the
 * multi-MB source bytes from list results, but a Collage owns no pixels at
 * all — the record *is* its own summary, so `list` returns full records.
 */
export class CollageStore extends Context.Service<CollageStore, CollageStoreContract>()(
  'CollageStore',
) {}
