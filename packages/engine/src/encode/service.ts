import type { Effect } from 'effect'
import { Context, Schema } from 'effect'
import type { ExportSettings } from './settings'

export class EncodeError extends Schema.TaggedErrorClass<EncodeError>()('EncodeError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

export interface ImageEncoderContract {
  /**
   * Encode an RGBA `ImageData` frame to the requested format/settings,
   * downscaling first when the scale is below 100%. Platform-neutral bytes
   * out — the caller picks the Blob/mime.
   */
  readonly encode: (input: {
    readonly image: ImageData
    readonly settings: ExportSettings
  }) => Effect.Effect<Uint8Array, EncodeError>
}

/**
 * The export encoder. The engine defines the contract; the implementation
 * is swappable behind this service — jSquash wasm codecs (the default
 * layer), native encoders, or a server round-trip (see
 * docs/adr/0006-image-encoder-engine-service.md).
 */
export class ImageEncoder extends Context.Service<ImageEncoder, ImageEncoderContract>()(
  'ImageEncoder',
) {}
