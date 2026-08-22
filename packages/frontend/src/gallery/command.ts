import { Array, DateTime, Effect, Schema as S } from 'effect'
import { Command, File as FoldkitFile } from 'foldkit'
import type { StoreError } from '@lutra/store'
import {
  Collage,
  CollageStore,
  CollageIdSchema,
  EditStore,
  EditIdSchema,
  Edit,
  EditId,
  newCollageId,
  newEditId,
  defaultCollageLayout,
} from '@lutra/store'
import { ImageDecodeError, ThumbnailEncodeError } from '../errors'
import {
  EditsListed,
  ListFailed,
  EditDeleted,
  DeleteFailed,
  PhotoCreated,
  PhotoCreateFailed,
  PhotoPickCancelled,
  PhotosAdded,
  CollageCreated,
  CollageCreateFailed,
  CollagesListed,
  CollageListFailed,
  CollageDeleted,
  CollageDeleteFailed,
} from './message'

/**
 * Fetch the gallery grid (`EditStore.list`): the Edit summaries, source bytes
 * excluded. A backend failure surfaces as `ListFailed` so the grid can show
 * an error state.
 */
export const ListEdits = Command.define('ListEdits', {
  execute: Effect.gen(function* () {
    const store = yield* EditStore
    const summaries = yield* store.list()
    return EditsListed({ summaries })
  }).pipe(
    Effect.catchTag('StoreError', (err: StoreError) => Effect.succeed(ListFailed({ error: err }))),
  ),
  messages: [EditsListed, ListFailed],
})

/**
 * Delete one Edit by id (`EditStore.delete`); the caller re-lists to reflect
 * the smaller grid. An unknown id is a no-op. A backend failure surfaces as
 * `DeleteFailed`.
 */
/**
 * Fetch the saved collages for the main menu's Collages section
 * (docs/adr/0030): full records — the layout drives the mini-previews. The
 * store orders newest-first.
 */
export const ListCollages = Command.define('ListCollages', {
  execute: Effect.gen(function* () {
    const store = yield* CollageStore
    const collages = yield* store.list()
    return CollagesListed({ collages })
  }).pipe(
    Effect.catchTag('StoreError', (err: StoreError) =>
      Effect.succeed(CollageListFailed({ error: err })),
    ),
  ),
  messages: [CollagesListed, CollageListFailed],
})

/**
 * Delete one collage by id (`CollageStore.delete`); the caller re-lists to
 * reflect the smaller section. Deleting a collage never touches its
 * referenced Edits (docs/adr/0030: composition by reference). A backend
 * failure surfaces as `CollageDeleteFailed`.
 */
export const DeleteCollage = Command.define('DeleteCollage', {
  args: { id: CollageIdSchema },
  execute: ({ id }) =>
    Effect.gen(function* () {
      const store = yield* CollageStore
      yield* store.delete(id)
      return CollageDeleted()
    }).pipe(
      Effect.catchTag('StoreError', (err: StoreError) =>
        Effect.succeed(CollageDeleteFailed({ error: err })),
      ),
    ),
  messages: [CollageDeleted, CollageDeleteFailed],
})

export const DeleteEdit = Command.define('DeleteEdit', {
  args: { id: EditIdSchema },
  execute: ({ id }) => Effect.gen(function* () {
    const store = yield* EditStore
    yield* store.delete(id)
    return EditDeleted()
  }).pipe(
    Effect.catchTag('StoreError', (err: StoreError) =>
      Effect.succeed(DeleteFailed({ error: err })),
    ),
  ),
  messages: [EditDeleted, DeleteFailed],
})

/** The accepted image types for the native picker (mirrors the editor's `PickImageFile`). */
const IMAGE_TYPES = ['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif']

/** The picked file's bytes — the Edit's source image, stored verbatim. */
const readBytes = (file: File): Effect.Effect<Uint8Array, ImageDecodeError> =>
  Effect.tryPromise({
    catch: (cause) =>
      new ImageDecodeError({
        cause,
        message: `failed to read the picked photo: ${String(cause)}`,
      }),
    try: async () => await file.arrayBuffer(),
  }).pipe(Effect.map((buffer) => new Uint8Array(buffer)))

/**
 * A small JPEG of the picked photo, downscaled to fit `maxDim`, to seed the
 * new Edit's thumbnail. An empty chain renders the source as-is, so the
 * thumbnail is the raw photo (like the mobile's preview-as-thumbnail).
 */
const thumbnailBytes = (
  file: File,
  maxDim = 320,
): Effect.Effect<Uint8Array, ImageDecodeError | ThumbnailEncodeError> =>
  Effect.gen(function* () {
    const bitmap = yield* Effect.tryPromise({
      catch: (cause) =>
        new ImageDecodeError({
          cause,
          message: `failed to decode the picked photo: ${String(cause)}`,
        }),
      try: async () => await createImageBitmap(file),
    })
    try {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return new Uint8Array(0)
      }
      ctx.drawImage(bitmap, 0, 0, width, height)
      const blob = yield* Effect.tryPromise({
        catch: (cause) =>
          new ThumbnailEncodeError({
            cause,
            message: `failed to encode the thumbnail: ${String(cause)}`,
          }),
        try: async () => await canvas.convertToBlob({ quality: 0.85, type: 'image/jpeg' }),
      })
      const buffer = yield* Effect.tryPromise({
        catch: (cause) =>
          new ThumbnailEncodeError({
            cause,
            message: `failed to encode the thumbnail: ${String(cause)}`,
          }),
        try: async () => await blob.arrayBuffer(),
      })
      return new Uint8Array(buffer)
    } finally {
      bitmap.close()
    }
  })

/**
 * Turn one picked photo into a persisted self-contained Edit: read its bytes,
 * encode the seed thumbnail, and save it under a fresh uuid. Self-contained
 * so the single-pick and batch paths share it; failures stay on the error
 * channel for the caller to shape (docs/adr/0032).
 */
const createEdit = (
  file: File,
): Effect.Effect<EditId, ImageDecodeError | ThumbnailEncodeError | StoreError, EditStore> =>
  Effect.gen(function* () {
    const source = yield* readBytes(file)
    const thumbnail = yield* thumbnailBytes(file)

    const store = yield* EditStore
    const id = newEditId()
    yield* store.save(
      Edit.make({
        chain: [],
        id,
        savedAt: DateTime.nowUnsafe().epochMilliseconds,
        source,
        thumbnail,
      }),
    )
    return id
  })

/**
 * The gallery's "open a photo" flow, extended to multiple picks
 * (docs/adr/0032). Opens the native file picker with multi-select on and
 * turns every picked photo into a self-contained Edit (fresh uuid, empty
 * chain, source + thumbnail bytes, now), mirroring the mobile main menu.
 *
 * A dismissed picker is a no-op. A single pick keeps the classic flow:
 * persist, then surface `PhotoCreated` — the root navigates the editor onto
 * it. Several picks at once stay on the gallery instead: the command lists
 * the store fresh and returns `PhotosAdded` carrying that listing plus the
 * failure tally (one bad file never loses the rest of the batch), so the
 * grid updates without any navigation. Any single-pick failure surfaces as
 * `PhotoCreateFailed` so the gallery can show it instead of silently
 * dropping the photo.
 */
export const OpenPhoto = Command.define('OpenPhoto', {
  execute: Effect.gen(function* () {
    const files = yield* FoldkitFile.selectMultiple(IMAGE_TYPES)
    if (files.length === 0) {
      return PhotoPickCancelled()
    }

    // A single pick keeps the classic flow: straight into the editor on the
    // new Edit, failures surfacing through the catch arms below unchanged.
    if (files.length === 1) {
      const [file] = files
      if (file === undefined) {
        return PhotoPickCancelled()
      }
      const id = yield* createEdit(file)
      return PhotoCreated({ id })
    }

    // Several picks at once: every photo becomes its own Edit — one bad file
    // never loses the batch — and nobody navigates. The listing rides along
    // in the message so the grid refreshes the moment the result lands (a
    // follow-up ListEdits would land after the notice and wipe it).
    const [failures, createdIds] = yield* Effect.partition(files, createEdit)
    const store = yield* EditStore
    const summaries = yield* Effect.option(store.list())
    return PhotosAdded({
      added: createdIds.length,
      failed: failures.length,
      error: Array.head(failures),
      summaries,
    })
  }).pipe(
    Effect.catchTag('StoreError', (err: StoreError) =>
      Effect.succeed(PhotoCreateFailed({ error: err })),
    ),
    Effect.catchTag('ImageDecodeError', (err: ImageDecodeError) =>
      Effect.succeed(PhotoCreateFailed({ error: err })),
    ),
    Effect.catchTag('ThumbnailEncodeError', (err: ThumbnailEncodeError) =>
      Effect.succeed(PhotoCreateFailed({ error: err })),
    ),
  ),
  messages: [PhotoCreated, PhotoPickCancelled, PhotoCreateFailed, PhotosAdded],
})

/**
 * The gallery's "create collage" flow (docs/adr/0030): persist a new Collage
 * (fresh uuid, default layout, one tile per selected Edit in pick order) and
 * surface the id as `CollageCreated`. Persist-first, like opening a photo —
 * the record exists before the screen opens, and the root navigates onto it.
 * A backend failure surfaces as `CollageCreateFailed` so the gallery can show
 * it instead of silently dropping the selection.
 */
export const CreateCollage = Command.define('CreateCollage', {
  args: { editIds: S.Array(EditIdSchema) },
  execute: ({ editIds }) =>
    Effect.gen(function* CreateCollage() {
      const store = yield* CollageStore
      const id = newCollageId()
      yield* store.save(
        Collage.make({
          id,
          savedAt: DateTime.nowUnsafe().epochMilliseconds,
          layout: defaultCollageLayout(),
          tiles: editIds.map((editId) => ({ editId })),
        }),
      )
      return CollageCreated({ id })
    }).pipe(
      Effect.catchTag('StoreError', (err: StoreError) =>
        Effect.succeed(CollageCreateFailed({ error: err })),
      ),
    ),
  messages: [CollageCreated, CollageCreateFailed],
})
