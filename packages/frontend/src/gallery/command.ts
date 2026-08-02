import { Effect, Option } from 'effect'
import { Command, File as FoldkitFile } from 'foldkit'
import { EditStore, EditIdSchema, Edit, newEditId, StoreError } from '@lutra/store'
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
 * an error state. The no-op backend returns `[]` during the foundation slice.
 */
export const ListEdits = Command.define('ListEdits', {
  messages: [EditsListed, ListFailed],
  execute: Effect.gen(function* () {
    const store = yield* EditStore
    const summaries = yield* store.list()
    return EditsListed({ summaries })
  }).pipe(
    Effect.catchIf(
      (err): err is StoreError => err instanceof StoreError,
      (err) => Effect.succeed(ListFailed({ error: err.message })),
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
      Effect.catchIf(
        (err): err is StoreError => err instanceof StoreError,
        (err) => Effect.succeed(DeleteFailed({ error: err.message })),
      ),
    ),
})

// ---- open a photo (new edit) ----

/** The accepted image types for the native picker (mirrors the editor's `PickImageFile`). */
const IMAGE_TYPES = ['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif']

/** The picked file's bytes — the Edit's source image, stored verbatim. */
const readBytes = (file: File): Effect.Effect<Uint8Array, Error> =>
  Effect.tryPromise({
    try: () => file.arrayBuffer(),
    catch: (cause) => new Error(`failed to read the picked photo: ${String(cause)}`),
  }).pipe(Effect.map((buffer) => new Uint8Array(buffer)))

/**
 * A small JPEG of the picked photo, downscaled to fit `maxDim`, to seed the
 * new Edit's thumbnail. An empty chain renders the source as-is, so the
 * thumbnail is the raw photo (like the mobile's preview-as-thumbnail).
 */
const thumbnailBytes = (file: File, maxDim = 320): Effect.Effect<Uint8Array, Error> =>
  Effect.gen(function* () {
    const bitmap = yield* Effect.tryPromise({
      try: () => createImageBitmap(file),
      catch: (cause) => new Error(`failed to decode the picked photo: ${String(cause)}`),
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
        catch: (cause) => new Error(`failed to encode the thumbnail: ${String(cause)}`),
      })
      const buffer = yield* Effect.tryPromise({
        try: () => blob.arrayBuffer(),
        catch: (cause) => new Error(`failed to encode the thumbnail: ${String(cause)}`),
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
    Effect.catchIf(
      (err): err is StoreError => err instanceof StoreError,
      (err) => Effect.succeed(PhotoCreateFailed({ error: err.message })),
    ),
    Effect.catchIf(
      (err): err is Error => err instanceof Error,
      (err) => Effect.succeed(PhotoCreateFailed({ error: err.message })),
    ),
  ),
})
