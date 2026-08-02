import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { EditSummary, EditIdSchema } from '@lutra/store'

/**
 * The Gallery Submodel's message union (docs/adr/0009). These are internal to
 * the gallery — the root sees them wrapped as `GotGalleryMessage`. The
 * gallery surfaces the facts the root cares about (a tile was opened) via an
 * `OutMessage` (`OpenedEdit`), not through its Messages.
 */

// ---- grid ----
/** A fresh list of summaries landed from the EditStore (a ListEdits result). */
export const EditsListed = Message.m('EditsListed', { summaries: S.Array(EditSummary) })
export const ListFailed = Message.m('ListFailed', { error: S.String })
/** The user asked to re-fetch the grid. */
export const RefreshRequested = Message.m('RefreshRequested')

// ---- tile actions ----
/** A tile was clicked. The update emits the `OpenedEdit` OutMessage for the root. */
export const ClickedEdit = Message.m('ClickedEdit', { id: EditIdSchema })
/** A tile's delete control was pressed. */
export const DeleteRequested = Message.m('DeleteRequested', { id: EditIdSchema })
export const EditDeleted = Message.m('EditDeleted')
export const DeleteFailed = Message.m('DeleteFailed', { error: S.String })

// ---- open a photo (new edit) ----
/** The user pressed "Open photo": fire the native file picker and create a new Edit. */
export const OpenPhotoRequested = Message.m('OpenPhotoRequested')
/** The picker was dismissed without a selection — a no-op. */
export const PhotoPickCancelled = Message.m('PhotoPickCancelled')
/** A new Edit was persisted; the root navigates the editor onto it. */
export const PhotoCreated = Message.m('PhotoCreated', { id: EditIdSchema })
export const PhotoCreateFailed = Message.m('PhotoCreateFailed', { error: S.String })

export const GalleryMessage = S.Union([
  EditsListed,
  ListFailed,
  RefreshRequested,
  ClickedEdit,
  DeleteRequested,
  EditDeleted,
  DeleteFailed,
  OpenPhotoRequested,
  PhotoPickCancelled,
  PhotoCreated,
  PhotoCreateFailed,
])
export type GalleryMessage = typeof GalleryMessage.Type

/**
 * The fact the gallery surfaces to the root (docs/adr/0009). Narrow and
 * semantic: the root owns navigation, so "open this edit" is the one fact the
 * gallery emits. The root reacts by pushing the `/edit/:id` URL.
 */
export const OpenedEdit = Message.m('OpenedEdit', { id: EditIdSchema })
export type GalleryOutMessage = typeof OpenedEdit.Type
