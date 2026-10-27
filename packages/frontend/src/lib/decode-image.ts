import { FlashRaw } from 'flashraw'
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
let busy = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined

/** How long an unused pool keeps its worker (and the wasm heap) alive. */
const POOL_IDLE_MS = 30_000

/** The pool, created on demand; it stays alive while any call holds it. */
const acquirePool = (): NonNullable<typeof pool> => {
  clearTimeout(idleTimer)
  busy += 1
  pool ??= createWorkerPool({ size: 1 })
  return pool
}

/** Release one hold; an idle pool is terminated so the worker's heap is freed. */
const releasePool = (): void => {
  busy -= 1
  if (busy === 0) {
    idleTimer = setTimeout(() => {
      pool?.terminate()
      pool = undefined
    }, POOL_IDLE_MS)
  }
}

/**
 * Start the decoder's worker and compile its wasm ahead of the first RAW
 * decode. Call it when the user opens a file picker: the dialog gives the
 * download and compile seconds to finish, so the first decode starts hot.
 * Holds the pool like a decode does, so an unused warm-up also idles out.
 */
export const warmRawDecoder = (): void => {
  if (inWorker) {
    return
  }
  const warmed = acquirePool()
  void warmed.getCapabilities().then(releasePool, releasePool)
}

/** The tools' image workers decode inline; the main thread uses a worker pool. */
const inWorker = typeof window === 'undefined'

interface RawHandle {
  /** The sensor image's size after the default crop. */
  readonly size: { width: number; height: number }
  readonly rgba8: (halfSize: boolean) => Promise<{ data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }>
  readonly preview: () => Promise<{ data: Uint8Array<ArrayBuffer>; mimeType: string } | null>
}

const decodeOptions = (halfSize: boolean) =>
  ({ colorSpace: 'srgb', demosaic: halfSize ? 'half-size' : 'bilinear', output: 'rgba8' }) as const

/** Open `blob` with FlashRaw, run `use`, and always close the handle. */
const withRaw = async <A>(blob: Blob, use: (raw: RawHandle) => Promise<A>): Promise<A> => {
  if (inWorker) {
    const raw = await FlashRaw.open(blob)
    try {
      return await use({
        preview: async () => await raw.preview(),
        rgba8: async (halfSize) => await raw.decode(decodeOptions(halfSize)),
        size: raw.metadata,
      })
    } finally {
      raw.close()
    }
  }
  const held = acquirePool()
  try {
    const raw = await held.open(blob)
    try {
      return await use({
        preview: async () => await raw.preview(),
        rgba8: async (halfSize) => await raw.decode(decodeOptions(halfSize)),
        size: raw.metadata,
      })
    } finally {
      await raw.close()
    }
  } finally {
    releasePool()
  }
}

/**
 * Decode a RAW file off the main thread into an 8-bit sRGB bitmap
 * (docs/adr/0008-raw-decode). Orientation is already applied by the decoder.
 */
const decodeRaw = async (blob: Blob, longEdge: number | undefined): Promise<ImageBitmap> =>
  await withRaw(blob, async (raw) => {
    // Half-size demosaic is cheaper and still covers the target when the
    // sensor has at least twice the pixels the caller will keep.
    const halfSize =
      longEdge !== undefined && Math.max(raw.size.width, raw.size.height) >= longEdge * 2
    const frame = await raw.rgba8(halfSize)
    return await createImageBitmap(new ImageData(frame.data, frame.width, frame.height))
  })

/**
 * The camera-rendered JPEG inside a RAW file, or null when the file has none
 * or is not RAW. Instant (no decode), so it can stand in for the photo while
 * the full decode runs and for `<img>` previews, which cannot show RAW.
 */
export const rawPreview = async (blob: Blob): Promise<Blob | null> => {
  try {
    return await withRaw(blob, async (raw) => {
      const preview = await raw.preview()
      return preview === null || preview.mimeType !== 'image/jpeg'
        ? null
        : new Blob([preview.data], { type: preview.mimeType })
    })
  } catch {
    return null
  }
}

/**
 * A bitmap good enough for a small thumbnail: a RAW file's embedded JPEG
 * (instant) or, failing that, the full decode.
 */
export const decodeThumbnailSource = async (file: File): Promise<ImageBitmap> => {
  const preview = isRawFile(file) ? await rawPreview(file) : null
  if (preview !== null) {
    try {
      return await createImageBitmap(preview)
    } catch {
      // an undecodable preview falls through to the full decode
    }
  }
  return await decodeImage(file)
}

/**
 * A URL an `<img>` can show for a picked file: the file itself, or the
 * embedded JPEG for a RAW file. Falls back to the file when RAW has no preview.
 */
export const displayUrl = async (file: File): Promise<string> => {
  const preview = isRawFile(file) ? await rawPreview(file) : null
  return URL.createObjectURL(preview ?? file)
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
export interface DecodeOptions {
  readonly bitmap?: ImageBitmapOptions
  /** The longest edge the caller will keep; lets a RAW decode skip detail it would discard. */
  readonly longEdge?: number
}

export const decodeImage = async (
  source: Blob,
  { bitmap = {}, longEdge }: DecodeOptions = {},
): Promise<ImageBitmap> => {
  const rawFirst =
    (source instanceof File && isRawFile(source)) || !(await startsWithBrowserFormat(source))
  if (rawFirst) {
    try {
      return await decodeRaw(source, longEdge)
    } catch {
      return await createImageBitmap(source, bitmap)
    }
  }
  try {
    return await createImageBitmap(source, bitmap)
  } catch (browserError) {
    try {
      return await decodeRaw(source, longEdge)
    } catch {
      throw browserError
    }
  }
}
