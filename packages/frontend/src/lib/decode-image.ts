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

const ascii = (head: Uint8Array, start: number, text: string): boolean =>
  text.split('').every((char, index) => head[start + index] === char.charCodeAt(0))

const BROWSER_BRANDS = ['avif', 'avis', 'heic', 'heix', 'hevc', 'mif1', 'msf1']

/**
 * Whether the leading bytes are a format the browser decodes natively
 * (JPEG, PNG, GIF, WebP, BMP, AVIF/HEIC). Everything else, TIFF-based RAW
 * containers and Canon CR3 (an ISO-BMFF `crx ` brand) included, is not.
 */
export const isBrowserFormat = (head: Uint8Array): boolean =>
  (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) ||
  (head[0] === 0x89 && ascii(head, 1, 'PNG')) ||
  ascii(head, 0, 'GIF8') ||
  ascii(head, 0, 'BM') ||
  (ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP')) ||
  (ascii(head, 4, 'ftyp') && BROWSER_BRANDS.some((brand) => ascii(head, 8, brand)))

const startsWithBrowserFormat = async (blob: Blob): Promise<boolean> =>
  isBrowserFormat(new Uint8Array(await blob.slice(0, 16).arrayBuffer()))

/**
 * The one entry point for turning image bytes into an `ImageBitmap`.
 * A file named like RAW, or whose bytes are not a browser format, tries
 * FlashRaw first; anything else tries the browser first and falls back to
 * FlashRaw. Either way the browser decoder's error is the one surfaced
 * (docs/adr/0008-raw-decode).
 */
export const decodeImage = async (source: Blob): Promise<ImageBitmap> => {
  const rawFirst =
    (source instanceof File && isRawFile(source)) || !(await startsWithBrowserFormat(source))
  if (rawFirst) {
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
