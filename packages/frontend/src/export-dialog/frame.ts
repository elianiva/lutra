/**
 * The export frame slot (docs/adr/0004-export): one composed/snapshotted export
 * frame, owned by the shared export-dialog machine. The pixels live OUTSIDE
 * the TEA model — a full-resolution ImageData is megabytes of pixels, and
 * routing them through Messages/Model makes every model log, diff, or
 * devtools snapshot enumerate millions of array cells (observed as a hard
 * crash with the devtools mounted). The model holds only a readiness flag;
 * this slot owns the pixels for the dialog's lifetime — exactly the seam
 * `thumbnail-url.ts` uses for thumbnail blobs.
 *
 * The owning screen slots a frame when it opens its dialog and clears it on
 * close, so one shared slot is all the ownership this needs.
 */
let frame: ImageData | null = null

/** Slot the composed/readback frame (called by the owning screen's snapshot path). */
export const setFrame = (image: ImageData): void => {
  frame = image
}

/** The slotted frame, if one is held for an open dialog. */
export const peekFrame = (): ImageData | null => frame

/** Drop the slotted frame (dialog closed, late result). */
export const clearFrame = (): void => {
  frame = null
}
