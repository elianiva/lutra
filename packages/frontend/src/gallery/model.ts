import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { EditSummary, StoreError, EditIdSchema, Collage, CollageIdSchema } from '@lutra/store'

/**
 * The Gallery Submodel's model (docs/adr/0009): the list of saved Edits
 * (their summaries) as AsyncData, plus the current GalleryPage it owns.
 *
 * There is no discrete "phases" machine here the way the Editor has one —
 * the gallery's lifecycle is exactly the AsyncData of the grid (idle →
 * loading → loaded / failed), plus the per-route field below.
 */
export const GalleryRoute = S.Struct({})

/** The summaries `list()` returns, held as AsyncData (source bytes excluded). */
export const EditList = AsyncData.Schema(S.Array(EditSummary), StoreError)
/** The schema's typed constructors (`EditList.Success` etc.). */
export const editList = EditList
/** The saved collages beneath the edits grid (newest first), as AsyncData. */
export const CollageList = AsyncData.Schema(S.Array(Collage), StoreError)
/** The schema's typed constructors (`CollageList.Success` etc.). */
export const collageList = CollageList

export const Model = S.Struct({
  grid: EditList.schema,
  // A transient banner message (e.g. a failed photo create), null when clean.
  notice: S.NullOr(S.String),
  // The current collage selection: Edit ids picked via the per-tile select
  // controls. Empty means nothing is selected; "Create collage" enables at two.
  selection: S.Array(EditIdSchema),
  // The saved-collages section under the edits grid (docs/adr/0030).
  collages: CollageList.schema,
  // Measured thumbnail pixel sizes for collage tiles whose framing is
  // custom (docs/adr/0033) — the mini-previews mirror the framing, which
  // needs each photo's aspect. Default-framed tiles stay object-cover.
  collageThumbSizes: S.Array(S.Struct({ editId: EditIdSchema, width: S.Number, height: S.Number })),
  // ADR-0022's inline two-step delete confirm, per collage card.
  confirmingCollageDelete: S.NullOr(CollageIdSchema),
  // The Edit id awaiting delete confirmation in the modal dialog (ADR-0022,
  // superseded to a dialog): null when no deletion is pending.
  pendingDelete: S.NullOr(EditIdSchema),
  // The settings dialog submodel (@foldkit/ui): open/close/animation state.
  settingsDialog: Dialog.Model,
  // The delete-confirmation dialog submodel (@foldkit/ui), opened by a
  // tile's ✕ (ADR-0022, superseded to a dialog).
  deleteDialog: Dialog.Model,
  // The Experimental section's flags. UI-only for now — nothing reads them
  // yet; wiring them up changes app behavior and comes later.
  experimental: S.Struct({
    // "Infinite canvas": pan/zoom a Figma-style workspace instead of the
    // fixed photo canvas. Not wired up — a visual toggle only.
    infiniteCanvas: S.Boolean,
  }),
})
export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  grid: EditList.Idle(),
  notice: null,
  selection: [],
  collages: CollageList.Idle(),
  collageThumbSizes: [],
  confirmingCollageDelete: null,
  pendingDelete: null,
  settingsDialog: Dialog.init({ id: 'gallery-settings-dialog' }),
  deleteDialog: Dialog.init({ id: 'gallery-delete-dialog' }),
  experimental: {
    infiniteCanvas: false,
  },
})
