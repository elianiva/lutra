import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { EditSummary, EditIdSchema, StoreError, CollageIdSchema, Collage } from '@lutra/store'
import { ImageDecodeError, ThumbnailEncodeError } from '../errors'

/**
 * The Gallery Submodel's message union (docs/adr/0009). These are internal to
 * the gallery — the root sees them wrapped as `GotGalleryMessage`. The
 * gallery surfaces the facts the root cares about (a tile was opened) via an
 * `OutMessage` (`OpenedEdit`), not through its Messages.
 */

// ---- grid ----
/** A fresh list of summaries landed from the EditStore (a ListEdits result). */
export const EditsListed = Message.m('EditsListed', { summaries: S.Array(EditSummary) })
export const ListFailed = Message.m('ListFailed', { error: StoreError })
export const RefreshRequested = Message.m('RefreshRequested')

// ---- tile actions ----
/** A tile was clicked. The update emits the `OpenedEdit` OutMessage for the root. */
export const ClickedEdit = Message.m('ClickedEdit', { id: EditIdSchema })
/** A tile's ✕ was tapped: open the delete-confirmation dialog for that edit
 *  (ADR-0022, superseded to a dialog). */
export const DeleteConfirmRequested = Message.m('DeleteConfirmRequested', { id: EditIdSchema })
/** The deletion was confirmed in the dialog: delete the Edit record. */
export const DeleteRequested = Message.m('DeleteRequested', { id: EditIdSchema })
export const EditDeleted = Message.m('EditDeleted')
export const DeleteFailed = Message.m('DeleteFailed', { error: StoreError })

// ---- collage selection (docs/adr/0030) ----
/** A tile's select control was tapped: the id joins or leaves the selection. */
export const ToggledSelection = Message.m('ToggledSelection', { id: EditIdSchema })
/** "Create collage" was pressed with two or more selected. */
export const CreateCollageRequested = Message.m('CreateCollageRequested')

// ---- open a photo (new edit) ----
/** The user pressed "Open photo": fire the native file picker (multiple
 *  selection allowed) and create a new Edit per picked photo. */
export const OpenPhotoRequested = Message.m('OpenPhotoRequested')
/** The picker was dismissed without a selection — a no-op. */
export const PhotoPickCancelled = Message.m('PhotoPickCancelled')
/** Everything that can fail turning a picked photo into a persisted Edit. */
export const PhotoCreateError = S.Union([ImageDecodeError, ThumbnailEncodeError, StoreError])
/** A new Edit was persisted; the root navigates the editor onto it. */
export const PhotoCreated = Message.m('PhotoCreated', { id: EditIdSchema })
export const PhotoCreateFailed = Message.m('PhotoCreateFailed', {
  error: PhotoCreateError,
})
/** Several photos were opened at once (multi-file pick): each pick became its
 *  own Edit and the gallery stays put — no editor navigation; the user edits
 *  later by clicking a tile. `summaries` carries the post-save listing so the
 *  grid refreshes in place (None when that listing itself failed — the grid
 *  keeps its previous state). `failed` counts picks that couldn't become
 *  Edits, with the first failure as `error`. */
export const PhotosAdded = Message.m('PhotosAdded', {
  added: S.Number,
  failed: S.Number,
  error: S.Option(PhotoCreateError),
  summaries: S.Option(S.Array(EditSummary)),
})

// ---- collage section (docs/adr/0030): list + open + delete ----
/** A fresh list of collages landed from the CollageStore (a ListCollages result). */
export const CollagesListed = Message.m('CollagesListed', { collages: S.Array(Collage) })
export const CollageListFailed = Message.m('CollageListFailed', { error: StoreError })
/** A collage card was clicked; the update emits the `OpenedCollage` OutMessage. */
export const CollageOpenRequested = Message.m('CollageOpenRequested', { id: CollageIdSchema })
/** A collage card's ✕ was tapped: enter or leave the two-step confirm (docs/adr/0022). */
export const ToggledCollageDeleteConfirm = Message.m('ToggledCollageDeleteConfirm', {
  id: CollageIdSchema,
})
/** The confirm step was cancelled (✗ or a different card's ✕). */
export const CollageDeleteConfirmCancelled = Message.m('CollageDeleteConfirmCancelled')
/** The red confirm ✕ was tapped: delete the collage record. */
export const CollageDeleteRequested = Message.m('CollageDeleteRequested', { id: CollageIdSchema })
export const CollageDeleted = Message.m('CollageDeleted')
export const CollageDeleteFailed = Message.m('CollageDeleteFailed', { error: StoreError })

// ---- create a collage (persist-first, docs/adr/0030) ----
/** The Collage record was persisted from the current selection. */
export const CollageCreated = Message.m('CollageCreated', { id: CollageIdSchema })
/** The store refused the collage write. */
export const CollageCreateFailed = Message.m('CollageCreateFailed', { error: StoreError })

// ---- settings dialog ----

/** "Settings" was pressed in the header: open the settings dialog. */
export const SettingsRequested = Message.m('SettingsRequested')

// The dialog is a foldkit submodel (@foldkit/ui). Its messages arrive
// wrapped; update delegates to `Dialog.update` (mirrors the export dialogs).
export const GotSettingsDialogMessage = Message.m('GotSettingsDialogMessage', {
  message: Dialog.Message,
})

// Same pattern for the delete-confirmation dialog (ADR-0022, superseded).
export const GotDeleteDialogMessage = Message.m('GotDeleteDialogMessage', {
  message: Dialog.Message,
})

/** An experimental toggle flipped (the new checked state). UI-only for now —
 *  nothing consumes the flag yet. */
export const ToggledInfiniteCanvas = Message.m('ToggledInfiniteCanvas', { isEnabled: S.Boolean })

export const GalleryMessage = S.Union([
  EditsListed,
  ListFailed,
  RefreshRequested,
  ClickedEdit,
  DeleteConfirmRequested,
  DeleteRequested,
  EditDeleted,
  DeleteFailed,
  ToggledSelection,
  CreateCollageRequested,
  OpenPhotoRequested,
  PhotoPickCancelled,
  PhotoCreated,
  PhotoCreateFailed,
  PhotosAdded,
  CollageCreated,
  CollageCreateFailed,
  CollagesListed,
  CollageListFailed,
  CollageOpenRequested,
  ToggledCollageDeleteConfirm,
  CollageDeleteConfirmCancelled,
  CollageDeleteRequested,
  CollageDeleted,
  CollageDeleteFailed,
  SettingsRequested,
  GotSettingsDialogMessage,
  GotDeleteDialogMessage,
  ToggledInfiniteCanvas,
])
export type GalleryMessage = typeof GalleryMessage.Type

/**
 * The facts the gallery surfaces to the root (docs/adr/0009). Narrow and
 * semantic: the root owns navigation, so "open this edit" and "open this
 * collage" are the only facts the gallery emits. The root reacts by pushing
 * the corresponding URL.
 */
export const OpenedEdit = Message.m('OpenedEdit', { id: EditIdSchema })
export const CreatedCollage = Message.m('CreatedCollage', { id: CollageIdSchema })
export const OpenedCollage = Message.m('OpenedCollage', { id: CollageIdSchema })
export type GalleryOutMessage =
  | typeof OpenedEdit.Type
  | typeof CreatedCollage.Type
  | typeof OpenedCollage.Type
