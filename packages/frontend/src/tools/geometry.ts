import { Schema as S } from 'effect'

/**
 * Output geometry for a single photo: the target width, the frame's aspect
 * ratio, and the border band. Pure numbers, shared by the settings readouts
 * (main thread) and the pipeline (worker).
 */

export type Size = Readonly<{ width: number; height: number }>

/** Frame presets. `original` follows the photo's own ratio. */
export const FRAMES = ['original', '1:1', '4:5', '5:4', '3:2', '2:3', '16:9', '9:16'] as const
export const Frame = S.Literals(FRAMES)
export type Frame = typeof Frame.Type

/** Collage canvases always have a fixed ratio. */
export const COLLAGE_RATIOS = ['1:1', '4:5', '3:4', '2:3', '3:2', '16:9', '9:16'] as const
export const CollageRatio = S.Literals(COLLAGE_RATIOS)
export type CollageRatio = typeof CollageRatio.Type

/** Width / height of an `a:b` ratio label, so 4:5 is portrait. */
export const ratioValue = (ratio: CollageRatio | Exclude<Frame, 'original'>): number => {
  const [width = 1, height = 1] = ratio.split(':').map(Number)
  return width / height
}

/**
 * Border width for a target output width. The border sits outside the frame,
 * so the frame is narrower than the target and the output width stays on
 * target. A 4% border at a 1080 px width is 40 px, leaving a 1000 px frame.
 */
export const borderWidth = (width: number, percent: number): number => {
  const fraction = percent / 100
  return Math.round((fraction / (1 + 2 * fraction)) * width)
}

/** Frame size for a fixed ratio at a target output width. */
export const frameSize = (width: number, ratio: number, borderPercent: number): Size => {
  const inner = width - borderWidth(width, borderPercent) * 2
  return { width: inner, height: Math.max(1, Math.round(inner / ratio)) }
}

/**
 * Scale a source down to fit a box, keeping its aspect ratio. Never upscales.
 * Pass `Infinity` for a box dimension that must not constrain the result.
 */
const fitInside = (source: Size, boxWidth: number, boxHeight: number): Size => {
  const scale = Math.min(1, boxWidth / source.width, boxHeight / source.height)
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  }
}

/** The whole output (border included) for settings that fix its shape, or
 *  `null` when it follows each photo's own ratio. */
export const fixedOutputSize = (
  settings: Readonly<{
    width: number
    height: number | null
    frame: Frame
    borderPercent: number
  }>,
): Size | null => {
  if (settings.height !== null) return { width: settings.width, height: settings.height }
  if (settings.frame === 'original') return null
  const border = borderWidth(settings.width, settings.borderPercent)
  const frame = frameSize(settings.width, ratioValue(settings.frame), settings.borderPercent)
  return { width: settings.width, height: frame.height + border * 2 }
}

export type OutputGeometry = Readonly<{ canvas: Size; border: number; photo: Size }>

/**
 * The output canvas, the border band around it, and the photo inside the
 * canvas. The width is the target for the whole output, so the border takes
 * its share and the frame is contained in what is left.
 */
export const outputGeometry = (
  source: Size,
  settings: Readonly<{
    width: number
    height: number | null
    frame: Frame
    borderPercent: number
  }>,
): OutputGeometry => {
  const border = borderWidth(settings.width, settings.borderPercent)
  // An unlocked height fixes the whole output: the frame is what the border leaves.
  if (settings.height !== null) {
    const canvas = {
      width: settings.width - border * 2,
      height: Math.max(1, settings.height - border * 2),
    }
    return { canvas, border, photo: fitInside(source, canvas.width, canvas.height) }
  }
  // Without a frame the canvas is the photo, so the two always agree.
  if (settings.frame === 'original') {
    const photo = fitInside(source, settings.width - border * 2, Infinity)
    return { canvas: photo, border, photo }
  }
  const canvas = frameSize(settings.width, ratioValue(settings.frame), settings.borderPercent)
  return { canvas, border, photo: fitInside(source, canvas.width, canvas.height) }
}
