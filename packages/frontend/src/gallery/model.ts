import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'
import * as Dialog from '@/components/ui/dialog'
import { EditSummary, StoreError, EditIdSchema } from '@lutra/store'

/**
 * The Gallery Submodel's model (docs/adr/0006-frontend-architecture): the list of saved Edits
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

export const Model = S.Struct({
  grid: EditList.schema,
  // A transient banner message (e.g. a failed photo create), null when clean.
  notice: S.NullOr(S.String),
  // The Edit id awaiting delete confirmation in the modal dialog (ADR-0010,
  // superseded to a dialog): null when no deletion is pending.
  pendingDelete: S.NullOr(EditIdSchema),
  // The settings dialog submodel (@foldkit/ui): open/close/animation state.
  settingsDialog: Dialog.Model,
  // The delete-confirmation dialog submodel (@foldkit/ui), opened by a
  // tile's ✕ (ADR-0010, superseded to a dialog).
  deleteDialog: Dialog.Model,
  // The Experimental section's flags. UI-only for now — nothing reads them
  // yet; wiring them up changes app behavior and comes later.
  // Visual drag-over state: true while a file drag hovers the gallery
  // root so the view can render a drop overlay. Purely presentation —
  // the drop itself is handled by OnDropFiles.
  dragOver: S.Boolean,
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
  pendingDelete: null,
  settingsDialog: Dialog.init({ id: 'gallery-settings-dialog' }),
  deleteDialog: Dialog.init({ id: 'gallery-delete-dialog' }),
  dragOver: false,
  experimental: {
    infiniteCanvas: false,
  },
})
