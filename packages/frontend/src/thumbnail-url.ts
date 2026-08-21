import type { EditId } from '@lutra/store'

/**
 * Memoize bytes→object URL per summary id, shared by every surface that
 * renders stored thumbnails (the main menu grid and the collage preview).
 * Dormant while the store is empty; entries live for the session (the same
 * lifecycle as the gallery's original per-view cache).
 */
const cache = new Map<EditId, string>()

export const thumbnailUrl = (id: EditId, bytes: Uint8Array): string | null => {
  let url = cache.get(id)
  if (!url && bytes.length > 0) {
    // SAFETY: the store hands back the thumbnail bytes as a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    const blob = new Blob([bytes as BlobPart], { type: 'image/png' })
    url = URL.createObjectURL(blob)
    cache.set(id, url)
  }
  return url ?? null
}
