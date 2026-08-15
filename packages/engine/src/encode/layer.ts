import { Effect, Layer } from 'effect'
import { encodeImage } from './jsquash'
import { EncodeError, ImageEncoder } from './service'

const errMsg = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * The jSquash-backed encoder: the default implementation of `ImageEncoder`.
 * Runs the encode inline in the calling context; the frontend provides a
 * worker-backed layer for the app (see docs/adr/0006).
 */
export const ImageEncoderLive = Layer.succeed(
  ImageEncoder,
  ImageEncoder.of({
    encode: ({ image, settings }) =>
      Effect.tryPromise({
        try: () => encodeImage(image, settings),
        catch: (cause) => new EncodeError({ message: errMsg(cause), cause }),
      }),
  }),
)
