import type { EditId } from '@lutra/store'

/**
 * Memoize source bytes → object URL per Edit id, shared by the collage
 * preview. The source image is the full-resolution original (not the
 * thumbnail's downscaled graded preview), so the collage grid renders HD
 * while customizing layout and framing. Entries live for the session.
 */
const cache = new Map<EditId, string>()

export const photoUrl = (id: EditId, bytes: Uint8Array): string | null => {
  let url = cache.get(id)
  if (!url && bytes.length > 0) {
    // SAFETY: the store hands back image bytes over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    const blob = new Blob([bytes as BlobPart])
    url = URL.createObjectURL(blob)
    cache.set(id, url)
  }
  return url ?? null
}
