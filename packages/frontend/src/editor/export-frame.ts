import { createExportFrameCache } from '../export-frame'

/**
 * The editor's GPU-readback export frame. The pixels bypass the model
 * entirely — see the shared factory for why.
 */
const cache = createExportFrameCache()

export const setEditorExportFrame = cache.set
export const peekEditorExportFrame = cache.peek
export const clearEditorExportFrame = cache.clear
