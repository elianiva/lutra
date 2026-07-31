import { Schema as S } from 'effect'
import { Layer } from '@lutra/engine'
import { EditIdSchema } from './edit-id'

/**
 * The gallery tile: an Edit id, its thumbnail bytes, and its chain —
 * explicitly **without** the source-image bytes, so `list()` can render the
 * whole grid without loading every Edit's multi-MB source image. A
 * `byteLength` (the thumbnail's encoded size) feeds per-edit storage size in
 * the gallery/Options surface.
 *
 * Thumbnails render as object URLs the frontend converts from the stored
 * bytes; a future URL-serving cloud backend may return them by URL instead,
 * and the render contract is unchanged (docs/adr/0007).
 */
export const EditSummary = S.Struct({
  id: EditIdSchema,
  chain: S.Array(Layer),
  thumbnail: S.Uint8Array,
  /** Encoded thumbnail size in bytes (per-edit storage metering). */
  byteLength: S.Number,
  savedAt: S.Number,
})
export type EditSummary = typeof EditSummary.Type
