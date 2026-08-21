import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { EditSummary, EditIdSchema, StoreError, CollageIdSchema } from '@lutra/store'
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
export const DeleteRequested = Message.m('DeleteRequested', { id: EditIdSchema })
export const EditDeleted = Message.m('EditDeleted')
export const DeleteFailed = Message.m('DeleteFailed', { error: StoreError })

// ---- collage selection (docs/adr/0030) ----
/** A tile's select control was tapped: the id joins or leaves the selection. */
export const ToggledSelection = Message.m('ToggledSelection', { id: EditIdSchema })
/** "Create collage" was pressed with two or more selected. */
export const CreateCollageRequested = Message.m('CreateCollageRequested')

// ---- open a photo (new edit) ----
/** The user pressed "Open photo": fire the native file picker and create a new Edit. */
export const OpenPhotoRequested = Message.m('OpenPhotoRequested')
/** The picker was dismissed without a selection — a no-op. */
export const PhotoPickCancelled = Message.m('PhotoPickCancelled')
/** A new Edit was persisted; the root navigates the editor onto it. */
export const PhotoCreated = Message.m('PhotoCreated', { id: EditIdSchema })
export const PhotoCreateFailed = Message.m('PhotoCreateFailed', {
  error: S.Union([ImageDecodeError, ThumbnailEncodeError, StoreError]),
})

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

/** An experimental toggle flipped (the new checked state). UI-only for now —
 *  nothing consumes the flag yet. */
export const ToggledInfiniteCanvas = Message.m('ToggledInfiniteCanvas', { isEnabled: S.Boolean })

export const GalleryMessage = S.Union([
  EditsListed,
  ListFailed,
  RefreshRequested,
  ClickedEdit,
  DeleteRequested,
  EditDeleted,
  DeleteFailed,
  ToggledSelection,
  CreateCollageRequested,
  OpenPhotoRequested,
  PhotoPickCancelled,
  PhotoCreated,
  PhotoCreateFailed,
  CollageCreated,
  CollageCreateFailed,
  SettingsRequested,
  GotSettingsDialogMessage,
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
export type GalleryOutMessage = typeof OpenedEdit.Type | typeof CreatedCollage.Type
