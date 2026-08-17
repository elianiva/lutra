import { Schema } from 'effect'

// The frontend's domain errors (CONTEXT.md "Image decode error",
// "Thumbnail encode error", plus the editor-internal states they name).
// Every class follows the engine/store convention: a `Schema.TaggedErrorClass`
// with a `message` and an optional `cause`, so failures can cross the
// foldkit message boundary as validated values and be caught by tag.
//
// Posture (docs/adr/0010): these are recoverable failures — they sit on the
// Effect error channel of commands. Defects (programmer errors) are tagged
// throws instead, e.g. `MountElementError`.

/**
 * A source image could not be loaded — reading a picked file's bytes,
 * decoding it into an `ImageBitmap`, or decoding a saved Edit's source
 * bytes. One concept whether the browser API failed or the file is corrupt:
 * the user-visible failure is the same — the image cannot be opened.
 */
export class ImageDecodeError extends Schema.TaggedErrorClass<ImageDecodeError>()(
  'ImageDecodeError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

/**
 * A thumbnail (the small JPEG of the graded result or the picked photo that
 * seeds an Edit) could not be encoded — no 2d context, or a
 * `convertToBlob` failure. Distinct from the engine's `EncodeError` (the
 * export encoder's contract): thumbnails are downscaled by canvas 2D,
 * exports by the worker encoder.
 */
export class ThumbnailEncodeError extends Schema.TaggedErrorClass<ThumbnailEncodeError>()(
  'ThumbnailEncodeError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

/**
 * A mount's element contract was violated: the stream needs an `HTMLElement`
 * (typed wheel/pointer APIs) and foldkit mounted it on a plain `Element`.
 * The app's own markup always satisfies this, so it is a defect — thrown,
 * not Effect-failed.
 */
export class MountElementError extends Schema.TaggedErrorClass<MountElementError>()(
  'MountElementError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

/**
 * The render command ran before the canvas mount registered itself (or the
 * mount never ran). Recoverable by design — the render pipeline re-triggers
 * on the next mutation; flipping this to a defect would change
 * user-visible behavior for a race that the pipeline already absorbs.
 */
export class CanvasUnavailableError extends Schema.TaggedErrorClass<CanvasUnavailableError>()(
  'CanvasUnavailableError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

/**
 * A requested adjustment layer could not be assembled or validated against
 * the engine registry. The command boundary keeps this typed failure out of
 * the synchronous phase transition.
 */
export class LayerCreationError extends Schema.TaggedErrorClass<LayerCreationError>()(
  'LayerCreationError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

/**
 * The attached Edit (`/edit/:id`) does not exist — a stale URL or a deleted
 * tile. The store reports an absent id as `Option.None` (not an error), so
 * the command synthesizes this when it resolves `None` into the load
 * failure the editor's phase machine understands.
 */
export class EditNotFoundError extends Schema.TaggedErrorClass<EditNotFoundError>()(
  'EditNotFoundError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

/**
 * A field lookup on a known layer type missed — `fieldBounds` was asked for
 * a field the layer's UI metadata does not define. The metadata is static,
 * so this is a defect — thrown, not Effect-failed.
 */
export class UnknownFieldError extends Schema.TaggedErrorClass<UnknownFieldError>()(
  'UnknownFieldError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}
