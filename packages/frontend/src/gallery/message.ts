import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Dialog } from '@foldkit/ui'
import { EditSummary, EditIdSchema, StoreError, CollageIdSchema, Collage } from '@lutra/store'
import { ImageDecodeError, ThumbnailEncodeError } from '../errors'

/**
 * The Gallery Submodel's message union (docs/adr/0009). These are internal to
 * the gallery — the root sees them wrapped as `GotGalleryMessage`. The
 * gallery surfaces the facts the root cares about (a tile was opened) via an
 * `OutMessage` (`OpenedEdit`), not through its Messages.
 */

/** Everything that can fail turning a picked photo into a persisted Edit. */
export const PhotoCreateError = S.Union([ImageDecodeError, ThumbnailEncodeError, StoreError])

export const GalleryMessage = defineMessageUnion({
  // ---- grid ----
  /** A fresh list of summaries landed from the EditStore (a ListEdits result). */
  EditsListed: { summaries: S.Array(EditSummary) },
  ListFailed: { error: StoreError },
  RefreshRequested: {},

  // ---- tile actions ----
  /** A tile was clicked. The update emits the `OpenedEdit` OutMessage for the root. */
  ClickedEdit: { id: EditIdSchema },
  /** A tile's ✕ was tapped: open the delete-confirmation dialog for that edit
   *  (ADR-0022, superseded to a dialog). */
  DeleteConfirmRequested: { id: EditIdSchema },
  /** The deletion was confirmed in the dialog: delete the Edit record. */
  DeleteRequested: { id: EditIdSchema },
  EditDeleted: {},
  DeleteFailed: { error: StoreError },

  // ---- collage selection (docs/adr/0030) ----
  /** A tile's select control was tapped: the id joins or leaves the selection. */
  ToggledSelection: { id: EditIdSchema },
  /** "Create collage" was pressed with two or more selected. */
  CreateCollageRequested: {},

  // ---- open a photo (new edit) ----
  /** The user pressed "Open photo": fire the native file picker (multiple
   *  selection allowed) and create a new Edit per picked photo. */
  OpenPhotoRequested: {},
  /** The picker was dismissed without a selection — a no-op. */
  PhotoPickCancelled: {},
  /** A new Edit was persisted; the root navigates the editor onto it. */
  PhotoCreated: { id: EditIdSchema },
  PhotoCreateFailed: {
    error: PhotoCreateError,
  },
  /** Several photos were opened at once (multi-file pick): each pick became its
   *  own Edit and the gallery stays put — no editor navigation; the user edits
   *  later by clicking a tile. `summaries` carries the post-save listing so the
   *  grid refreshes in place (None when that listing itself failed — the grid
   *  keeps its previous state). `failed` counts picks that couldn't become
   *  Edits, with the first failure as `error`. */
  PhotosAdded: {
    added: S.Number,
    failed: S.Number,
    error: S.Option(PhotoCreateError),
    summaries: S.Option(S.Array(EditSummary)),
  },

  // ---- collage section (docs/adr/0030): list + open + delete ----
  /** A fresh list of collages landed from the CollageStore (a ListCollages result). */
  CollagesListed: { collages: S.Array(Collage) },
  CollageListFailed: { error: StoreError },
  /** The custom-framed collage tiles' thumbnail pixel sizes landed (docs/adr/0033). */
  CollageThumbsMeasured: {
    sizes: S.Array(S.Struct({ editId: EditIdSchema, width: S.Number, height: S.Number })),
  },
  /** A collage card was clicked; the update emits the `OpenedCollage` OutMessage. */
  CollageOpenRequested: { id: CollageIdSchema },
  /** A collage card's ✕ was tapped: enter or leave the two-step confirm (docs/adr/0022). */
  ToggledCollageDeleteConfirm: {
    id: CollageIdSchema,
  },
  /** The confirm step was cancelled (✗ or a different card's ✕). */
  CollageDeleteConfirmCancelled: {},
  /** The red confirm ✕ was tapped: delete the collage record. */
  CollageDeleteRequested: { id: CollageIdSchema },
  CollageDeleted: {},
  CollageDeleteFailed: { error: StoreError },

  // ---- create a collage (persist-first, docs/adr/0030) ----
  /** The Collage record was persisted from the current selection. */
  CollageCreated: { id: CollageIdSchema },
  /** The store refused the collage write. */
  CollageCreateFailed: { error: StoreError },

  // ---- settings dialog ----

  /** "Settings" was pressed in the header: open the settings dialog. */
  SettingsRequested: {},

  // The dialog is a foldkit submodel (@foldkit/ui). Its messages arrive
  // wrapped; update delegates to `Dialog.update` (mirrors the export dialogs).
  GotSettingsDialogMessage: {
    message: Dialog.Message,
  },

  // Same pattern for the delete-confirmation dialog (ADR-0022, superseded).
  GotDeleteDialogMessage: {
    message: Dialog.Message,
  },

  /** An experimental toggle flipped (the new checked state). UI-only for now —
   *  nothing consumes the flag yet. */
  ToggledInfiniteCanvas: { isEnabled: S.Boolean },
})
export type GalleryMessage = typeof GalleryMessage.Type

/**
 * The facts the gallery surfaces to the root (docs/adr/0009). Narrow and
 * semantic: the root owns navigation, so "open this edit" and "open this
 * collage" are the only facts the gallery emits. The root reacts by pushing
 * the corresponding URL.
 */
export const GalleryOutMessage = defineMessageUnion({
  OpenedEdit: { id: EditIdSchema },
  CreatedCollage: { id: CollageIdSchema },
  OpenedCollage: { id: CollageIdSchema },
})
export type GalleryOutMessage = typeof GalleryOutMessage.Type
