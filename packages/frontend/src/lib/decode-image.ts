import { createWorkerPool } from 'flashraw/worker'

/** Camera RAW extensions FlashRaw decodes; browsers cannot decode these. */
export const RAW_EXTENSIONS = [
  '.cr2', '.cr3', '.crw', '.nef', '.nrw', '.arw', '.sr2', '.srf', '.arq', '.raf',
  '.rw2', '.rwl', '.orf', '.ori', '.pef', '.srw', '.mrw', '.iiq', '.mos', '.3fr',
  '.fff', '.kdc', '.dcr', '.dcs', '.erf', '.mef', '.x3f', '.ari', '.dng',
] as const

const RAW_PATTERN = new RegExp(`(${RAW_EXTENSIONS.join('|').replaceAll('.', '\\.')})$`, 'i')

/** Whether the file name looks like a camera RAW file. */
export const isRawFile = (file: File): boolean => RAW_PATTERN.test(file.name)

let pool: ReturnType<typeof createWorkerPool> | undefined

/**
 * Decode a RAW file off the main thread into an 8-bit sRGB bitmap
 * (docs/adr/0008-raw-decode). Orientation is already applied by the decoder.
 */
const decodeRaw = async (blob: Blob): Promise<ImageBitmap> => {
  pool ??= createWorkerPool({ size: 1 })
  const frame = await pool.decode(blob, { output: 'rgba8', colorSpace: 'srgb' })
  return await createImageBitmap(new ImageData(frame.data, frame.width, frame.height))
}

/**
 * The one entry point for turning image bytes into an `ImageBitmap`.
 * A picked file named like a RAW file tries FlashRaw first; a stored Edit
 * source has no name, so it tries the browser first and falls back to
 * FlashRaw. Whichever order, the browser decoder's error is the one
 * surfaced (docs/adr/0008-raw-decode).
 */
export const decodeImage = async (source: Blob): Promise<ImageBitmap> => {
  if (source instanceof File && isRawFile(source)) {
    try {
      return await decodeRaw(source)
    } catch {
      return await createImageBitmap(source)
    }
  }
  try {
    return await createImageBitmap(source)
  } catch (browserError) {
    try {
      return await decodeRaw(source)
    } catch {
      throw browserError
    }
  }
}
