import { Schema as S } from 'effect'
import { Layer } from '@lutra/engine'
import { EditIdSchema } from './edit-id'

/**
 * A gallery record: a stable UUID identifying one edit chain, the source
 * image it grades, and a thumbnail of the graded result. A self-contained
 * record — it owns its own source-image bytes copy, so it can be saved,
 * loaded, and uploaded as one unit (docs/adr/0005-storage).
 *
 * The image payloads are `Uint8Array` bytes (the serialized PNG/JPEG encoding
 * of the source and the thumbnail), not `Blob`/`ImageBitmap` — bytes are the
 * platform-neutral carrier that crosses the storage seam, the URL boundary,
 * and a future server. The frontend decodes them to `ImageBitmap`/`Blob` for
 * rendering.
 */
export const Edit = S.Struct({
  /** The committed adjustment chain (engine's `Layer` schema). */
  chain: S.Array(Layer),
  /** Stable identity; never changes (Save updates in place, Save as forks a new id). */
  id: EditIdSchema,
  /** Timestamp ordering the gallery. */
  savedAt: S.Number,
  /** Encoded source-image bytes the editor grades. */
  source: S.Uint8Array,
  /** Encoded thumbnail bytes of the graded result (what the gallery tile shows). */
  thumbnail: S.Uint8Array,
})
export type Edit = typeof Edit.Type
