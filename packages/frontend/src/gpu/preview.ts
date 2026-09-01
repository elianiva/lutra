/**
 * Preview sizing: editor grades at preview resolution, export at native.
 * The preview long edge is capped to FHD-class (~2-3Mpx)
 * so a 6000×4000 photo dispatches ~2.8Mpx not 24Mpx — the same win the
 * collage path already gets by downsampling to cell size.
 *
 * Single source of truth for both the canvas attributes (view) and the
 * bitmap the session textures are sized to (command). Side-by-side becomes
 * 2× preview width (4096 for a 6k source) which fits an 8192
 * maxTextureDimension2D, whereas 2× native (12000) does not.
 */

export const PREVIEW_LONG_EDGE = 2048

export interface PreviewSize {
  readonly width: number
  readonly height: number
}

type CanvasWithQuality = CanvasRenderingContext2D & {
  imageSmoothingQuality: string
}

export const previewDimensions = (
  nativeWidth: number,
  nativeHeight: number,
): PreviewSize => {
  const longEdge = Math.max(nativeWidth, nativeHeight)
  if (longEdge <= PREVIEW_LONG_EDGE || longEdge === 0) {
    return { height: nativeHeight, width: nativeWidth }
  }
  const scale = PREVIEW_LONG_EDGE / longEdge
  return {
    height: Math.max(1, Math.round(nativeHeight * scale)),
    width: Math.max(1, Math.round(nativeWidth * scale)),
  }
}

/**
 * Downscale `bitmap` to preview size when native exceeds the cap.
 * Returns the original bitmap when no downscale is needed (caller keeps
 * ownership). When a new bitmap is created the source is closed — the
 * caller owns only the returned bitmap.
 *
 * Uses a 2d canvas drawImage (the same path collage uses for its framed
 * crop) then createImageBitmap(canvas). That stays correct even on Safari
 * where createImageBitmap(file, { resizeWidth }) is ignored. The canvas
 * is not inserted in the DOM.
 */
export const toPreviewBitmap = async (bitmap: ImageBitmap): Promise<ImageBitmap> => {
  const { width, height } = previewDimensions(bitmap.width, bitmap.height)
  if (width === bitmap.width && height === bitmap.height) {
    return bitmap
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return bitmap
  }
  ctx.imageSmoothingEnabled = true
  // SAFETY: imageSmoothingQuality is an optional canvas 2d property present
  // in modern browsers; the check guards its absence without throwing.
  if ('imageSmoothingQuality' in ctx) {
    // SAFETY: narrowed by the 'in' guard above; CanvasRenderingContext2D
    // may carry imageSmoothingQuality in supporting browsers.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    const qualityCtx = ctx as CanvasWithQuality
    qualityCtx.imageSmoothingQuality = 'high'
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  const preview = await createImageBitmap(canvas)
  bitmap.close()
  return preview
}

/**
 * Sampling helper for the collage path's framing canvas — re-exported so
 * tests can assert the cap without duplicating the arithmetic.
 */
export const isPreviewNeeded = (w: number, h: number): boolean =>
  Math.max(w, h) > PREVIEW_LONG_EDGE
