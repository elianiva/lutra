/**
 * The composed export frame lives OUTSIDE the TEA model (docs/adr/0031):
 * a full-resolution ImageData is megabytes of pixels, and routing it
 * through Messages/Model makes every model log, diff, or devtools snapshot
 * enumerate millions of array cells. The model holds only an `exportReady`
 * flag; this module owns the pixels for the dialog's lifetime — exactly the
 * seam `thumbnail-url.ts` uses for thumbnail blobs.
 */
let frame: ImageData | null = null

/** Cache the composed frame (called by the compose command's result path). */
export const setExportFrame = (image: ImageData): void => {
  frame = image
}

/** The composed frame, if one is cached for the open dialog. */
export const peekExportFrame = (): ImageData | null => frame

/** Drop the cached frame (dialog closed, stale result). */
export const clearExportFrame = (): void => {
  frame = null
}
