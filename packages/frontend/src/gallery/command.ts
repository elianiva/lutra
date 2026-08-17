import { DateTime, Effect, Option } from 'effect'
import { Command, File as FoldkitFile } from 'foldkit'
import type { StoreError } from '@lutra/store'
import { EditStore, EditIdSchema, Edit, newEditId } from '@lutra/store'
import { ImageDecodeError, ThumbnailEncodeError } from '../errors'
import {
  EditsListed,
  ListFailed,
  EditDeleted,
  DeleteFailed,
  PhotoCreated,
  PhotoCreateFailed,
  PhotoPickCancelled,
} from './message'

/**
 * Fetch the gallery grid (`EditStore.list`): the Edit summaries, source bytes
 * excluded. A backend failure surfaces as `ListFailed` so the grid can show
 * an error state.
 */
export const ListEdits = Command.define('ListEdits', {
  execute: Effect.fn('execute')(function* () {
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
export const DeleteEdit = Command.define('DeleteEdit', {
  args: { id: EditIdSchema },
  execute: Effect.fn('execute')(function* ({ id }) {
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

// ---- open a photo (new edit) ----

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
  Effect.fn('thumbnailBytes')(function* () {
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
  })()

/**
 * The gallery's "open a photo" flow (mirrors the mobile main menu): open the
 * native file picker, create a self-contained Edit for the picked photo
 * (fresh uuid, empty chain, source + thumbnail bytes, now), persist it, and
 * surface the new id as `PhotoCreated`. The root navigates the editor onto
 * it. A dismissed picker is a no-op; any failure surfaces as
 * `PhotoCreateFailed` so the gallery can show it instead of silently
 * dropping the photo.
 */
export const OpenPhoto = Command.define('OpenPhoto', {
  execute: Effect.fn('execute')(function* () {
    const picked = yield* FoldkitFile.select(IMAGE_TYPES)
    if (Option.isNone(picked)) {
      return PhotoPickCancelled()
    }
    const file = picked.value

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
    return PhotoCreated({ id })
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
  messages: [PhotoCreated, PhotoPickCancelled, PhotoCreateFailed],
})
