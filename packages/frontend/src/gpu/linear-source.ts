import type { LinearImage } from '../lib/linear-image'

/**
 * A RAW decode's linear half-float pixels, keyed by the 8-bit bitmap that
 * stands for the same image everywhere else (model, thumbnails, session
 * identity). The GPU backend uploads the linear form when it exists, so the
 * grade starts from sensor precision; every other consumer keeps reading the
 * bitmap. A WeakMap ties the pixels' lifetime to the bitmap's, with no
 * second field to thread through every message.
 */
const linearByBitmap = new WeakMap<ImageBitmap, LinearImage>()

export const attachLinearSource = (bitmap: ImageBitmap, linear: LinearImage): void => {
  linearByBitmap.set(bitmap, linear)
}

export const linearSourceOf = (bitmap: ImageBitmap): LinearImage | undefined =>
  linearByBitmap.get(bitmap)
