import { Effect, Option } from 'effect'
import { Command, File as FoldkitFile } from 'foldkit'
import { EditStore, EditIdSchema, Edit, newEditId, StoreError } from '@lutra/store'
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
  messages: [EditsListed, ListFailed],
  execute: Effect.gen(function* () {
    const store = yield* EditStore
    const summaries = yield* store.list()
    return EditsListed({ summaries })
  }).pipe(
    Effect.catchTag('StoreError', (err: StoreError) =>
      Effect.succeed(ListFailed({ error: err })),
    ),
  ),
})

/**
 * Delete one Edit by id (`EditStore.delete`); the caller re-lists to reflect
 * the smaller grid. An unknown id is a no-op. A backend failure surfaces as
 * `DeleteFailed`.
 */
export const DeleteEdit = Command.define('DeleteEdit', {
  args: { id: EditIdSchema },
  messages: [EditDeleted, DeleteFailed],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const store = yield* EditStore
      yield* store.delete(id)
      return EditDeleted()
    }).pipe(
      Effect.catchTag('StoreError', (err: StoreError) =>
        Effect.succeed(DeleteFailed({ error: err })),
      ),
    ),
})

// ---- open a photo (new edit) ----

/** The accepted image types for the native picker (mirrors the editor's `PickImageFile`). */
const IMAGE_TYPES = ['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif']

/** The picked file's bytes — the Edit's source image, stored verbatim. */
const readBytes = (file: File): Effect.Effect<Uint8Array, ImageDecodeError> =>
  Effect.tryPromise({
    try: () => file.arrayBuffer(),
    catch: (cause) =>
      new ImageDecodeError({
        message: `failed to read the picked photo: ${String(cause)}`,
        cause,
      }),
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
      try: () => createImageBitmap(file),
      catch: (cause) =>
        new ImageDecodeError({
          message: `failed to decode the picked photo: ${String(cause)}`,
          cause,
        }),
    })
    try {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return new Uint8Array(0)
      ctx.drawImage(bitmap, 0, 0, width, height)
      const blob = yield* Effect.tryPromise({
        try: () => canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }),
        catch: (cause) =>
          new ThumbnailEncodeError({
            message: `failed to encode the thumbnail: ${String(cause)}`,
            cause,
          }),
      })
      const buffer = yield* Effect.tryPromise({
        try: () => blob.arrayBuffer(),
        catch: (cause) =>
          new ThumbnailEncodeError({
            message: `failed to encode the thumbnail: ${String(cause)}`,
            cause,
          }),
      })
      return new Uint8Array(buffer)
    } finally {
      bitmap.close()
    }
  })

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
  messages: [PhotoCreated, PhotoPickCancelled, PhotoCreateFailed],
  execute: Effect.gen(function* () {
    const picked = yield* FoldkitFile.select(IMAGE_TYPES)
    if (Option.isNone(picked)) return PhotoPickCancelled()
    const file = picked.value

    const source = yield* readBytes(file)
    const thumbnail = yield* thumbnailBytes(file)

    const store = yield* EditStore
    const id = newEditId()
    yield* store.save(
      Edit.make({
        id,
        chain: [],
        source,
        thumbnail,
        savedAt: Date.now(),
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
})
