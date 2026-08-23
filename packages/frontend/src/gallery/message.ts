import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Dialog } from '@foldkit/ui'
import { EditSummary, EditIdSchema, StoreError, CollageIdSchema, Collage } from '@lutra/store'
import { ImageDecodeError, ThumbnailEncodeError } from '../errors'

/**
 * The Gallery Submodel's message union (docs/adr/0006-frontend-architecture). These are internal to
 * the gallery — the root sees them wrapped as `GotGalleryMessage`. The
 * gallery surfaces the facts the root cares about (a tile was opened) via an
 * `OutMessage` (`OpenedEdit`), not through its Messages.
 */

/** Everything that can fail turning a picked photo into a persisted Edit. */
export const PhotoCreateError = S.Union([ImageDecodeError, ThumbnailEncodeError, StoreError])

export const GalleryMessage = defineMessageUnion({
  EditsListed: { summaries: S.Array(EditSummary) },
  ListFailed: { error: StoreError },
  RefreshRequested: {},

  ClickedEdit: { id: EditIdSchema },
  DeleteConfirmRequested: { id: EditIdSchema },
  DeleteRequested: { id: EditIdSchema },
  EditDeleted: {},
  DeleteFailed: { error: StoreError },

  // collage selection (docs/adr/0009-collage)
  ToggledSelection: { id: EditIdSchema },
  CreateCollageRequested: {},

  OpenPhotoRequested: {},
  PhotoPickCancelled: {},
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

  // collage section (docs/adr/0009-collage): list + open + delete
  CollagesListed: { collages: S.Array(Collage) },
  CollageListFailed: { error: StoreError },
  CollageThumbsMeasured: {
    sizes: S.Array(S.Struct({ editId: EditIdSchema, width: S.Number, height: S.Number })),
  },
  CollageOpenRequested: { id: CollageIdSchema },
  ToggledCollageDeleteConfirm: {
    id: CollageIdSchema,
  },
  CollageDeleteConfirmCancelled: {},
  CollageDeleteRequested: { id: CollageIdSchema },
  CollageDeleted: {},
  CollageDeleteFailed: { error: StoreError },

  // create a collage (persist-first, docs/adr/0009-collage)
  CollageCreated: { id: CollageIdSchema },
  CollageCreateFailed: { error: StoreError },

  SettingsRequested: {},

  GotSettingsDialogMessage: {
    message: Dialog.Message,
  },

  GotDeleteDialogMessage: {
    message: Dialog.Message,
  },

  /** An experimental toggle flipped (the new checked state). UI-only for now —
   *  nothing consumes the flag yet. */
  ToggledInfiniteCanvas: { isEnabled: S.Boolean },
})
export type GalleryMessage = typeof GalleryMessage.Type

/**
 * The facts the gallery surfaces to the root (docs/adr/0006-frontend-architecture). Narrow and
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
