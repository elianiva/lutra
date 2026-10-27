import resize from '@jsquash/resize'
import { encodeImage } from '@lutra/engine'
import { clampGap, coverSourceRect, layoutCells } from '../collage/layout'
import { borderWidth, frameSize, outputGeometry, ratioValue } from '../geometry'
import type { Size } from '../geometry'
import { encodeSettings } from '../settings'
import type { Settings } from '../settings'
import type { Job, Output } from './protocol'

/**
 * The image pipeline. Runs inside a worker: decode with the EXIF orientation,
 * resize, frame, border, then encode through the engine's jSquash encoder.
 *
 * How far the browser's own scaler may shrink a photo before jSquash takes
 * over. Decoding a 24 MP photo straight into an ImageData costs ~96 MB per
 * worker; two steps stay sharp and keep that cost small.
 */
const PRE_SHRINK = 2

const context2d = (size: Size): OffscreenCanvasRenderingContext2D => {
  const context = new OffscreenCanvas(size.width, size.height).getContext('2d', {
    willReadFrequently: true,
  })
  if (context === null) throw new Error('This browser has no 2D canvas in workers')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  return context
}

const decode = async (file: File, failure: string): Promise<ImageBitmap> => {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(failure)
  }
}

/** Paint the border band, then lay the framed image in the middle of it. */
const withBorder = (framed: ImageData, border: number, color: string): ImageData => {
  if (border === 0) return framed
  const size = { width: framed.width + border * 2, height: framed.height + border * 2 }
  const context = context2d(size)
  context.fillStyle = color
  context.fillRect(0, 0, size.width, size.height)
  context.putImageData(framed, border, border)
  return context.getImageData(0, 0, size.width, size.height)
}

/** The engine encode, copied into a buffer of its own so it can be transferred. */
const encode = async (image: ImageData, settings: Settings) =>
  new Uint8Array(await encodeImage(image, encodeSettings(settings)))

const processSingle = async (file: File, settings: Settings): Promise<Output> => {
  const bitmap = await decode(file, 'This browser cannot decode the file')
  const source = { width: bitmap.width, height: bitmap.height }
  const { canvas, border, photo } = outputGeometry(source, settings)

  const shrink =
    Math.max(source.width, source.height) > Math.max(photo.width, photo.height) * PRE_SHRINK
  const decodeSize = shrink
    ? { width: photo.width * PRE_SHRINK, height: photo.height * PRE_SHRINK }
    : photo

  let image: ImageData
  try {
    const context = context2d(decodeSize)
    context.drawImage(bitmap, 0, 0, decodeSize.width, decodeSize.height)
    image = context.getImageData(0, 0, decodeSize.width, decodeSize.height)
  } finally {
    bitmap.close()
  }

  if (shrink) {
    image = await resize(image, {
      width: photo.width,
      height: photo.height,
      method: settings.method,
      fitMethod: 'stretch',
      premultiply: true,
      linearRGB: true,
    })
  }

  // The photo is centered on the frame's background colour.
  if (image.width !== canvas.width || image.height !== canvas.height) {
    const context = context2d(canvas)
    context.fillStyle = settings.background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.putImageData(
      image,
      Math.round((canvas.width - image.width) / 2),
      Math.round((canvas.height - image.height) / 2),
    )
    image = context.getImageData(0, 0, canvas.width, canvas.height)
  }

  const framed = withBorder(image, border, settings.borderColor)
  return {
    bytes: await encode(framed, settings),
    width: framed.width,
    height: framed.height,
    sourceWidth: source.width,
    sourceHeight: source.height,
    count: 1,
  }
}

/**
 * Shrink a decoded photo toward twice its cell size before drawing, so a
 * 9-cell collage of 24 MP photos never holds 9 full frames at once.
 */
const fitBitmap = async (bitmap: ImageBitmap, cell: Size): Promise<ImageBitmap> => {
  const capWidth = Math.max(1, Math.ceil(cell.width * 2))
  const capHeight = Math.max(1, Math.ceil(cell.height * 2))
  if (bitmap.width <= capWidth && bitmap.height <= capHeight) return bitmap
  const scale = Math.min(capWidth / bitmap.width, capHeight / bitmap.height)
  try {
    return await createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
      resizeQuality: 'high',
    })
  } catch {
    return bitmap
  }
}

const processCollage = async (job: Extract<Job, { kind: 'collage' }>): Promise<Output> => {
  const { settings } = job
  const frame = frameSize(settings.width, ratioValue(job.ratio), settings.borderPercent)
  const gap = clampGap(
    job.template,
    frame.width,
    frame.height,
    Math.round(frame.width * (Math.max(0, job.gapPercent) / 100)),
  )
  const rects = layoutCells(job.template, frame.width, frame.height, gap)

  const context = context2d(frame)
  context.fillStyle = settings.background
  context.fillRect(0, 0, frame.width, frame.height)

  let count = 0
  for (const [index, rect] of rects.entries()) {
    const file = job.files[index]
    if (!file) continue
    const bitmap = await decode(file, `Photo ${index + 1} cannot be decoded by this browser`)
    try {
      const fit = await fitBitmap(bitmap, { width: rect.w, height: rect.h })
      const adjust = job.cells[index] ?? { zoom: 1, fx: 0.5, fy: 0.5 }
      const src = coverSourceRect(fit.width, fit.height, rect.w, rect.h, adjust)
      context.drawImage(fit, src.sx, src.sy, src.sw, src.sh, rect.x, rect.y, rect.w, rect.h)
      if (fit !== bitmap) fit.close()
      count += 1
    } finally {
      bitmap.close()
    }
  }
  if (count === 0) throw new Error('Add at least one photo to the collage')

  const framed = withBorder(
    context.getImageData(0, 0, frame.width, frame.height),
    borderWidth(settings.width, settings.borderPercent),
    settings.borderColor,
  )
  return {
    bytes: await encode(framed, settings),
    width: framed.width,
    height: framed.height,
    sourceWidth: 0,
    sourceHeight: 0,
    count,
  }
}

export const process = async (job: Job): Promise<Output> =>
  job.kind === 'single' ? await processSingle(job.file, job.settings) : await processCollage(job)
