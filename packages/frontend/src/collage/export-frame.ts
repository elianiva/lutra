import { createExportFrameCache } from '../export-frame'

/**
 * The collage's composed export frame (docs/adr/0031). The pixels bypass
 * the model entirely — see the shared factory for why.
 */
const cache = createExportFrameCache()

export const setExportFrame = cache.set
export const peekExportFrame = cache.peek
export const clearExportFrame = cache.clear
