/**
 * A one-slot cache for a composed/snapshotted export frame, owned by the
 * submodel whose dialog is open. The frame lives OUTSIDE the TEA model
 * (docs/adr/0031): a full-resolution ImageData is megabytes of pixels, and
 * routing it through Messages/Model makes every model log, diff, or
 * devtools snapshot enumerate millions of array cells (observed as a hard
 * crash with the devtools mounted). The model holds only an `exportReady`
 * flag; this cache owns the pixels for the dialog's lifetime — exactly the
 * seam `thumbnail-url.ts` uses for thumbnail blobs.
 */
export interface ExportFrameCache {
  /** Cache the frame (called by the snapshot/compose command's result path). */
  readonly set: (image: ImageData) => void
  /** The cached frame, if one is held for an open dialog. */
  readonly peek: () => ImageData | null
  /** Drop the cached frame (dialog closed, stale result). */
  readonly clear: () => void
}

export const createExportFrameCache = (): ExportFrameCache => {
  let frame: ImageData | null = null
  return {
    set: (image) => {
      frame = image
    },
    peek: () => frame,
    clear: () => {
      frame = null
    },
  }
}
