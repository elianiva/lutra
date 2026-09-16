/**
 * Tile-array operations for the collage (docs/adr/0009-collage). Position IS the
 * array index in reading order, so reorder is a plain array move — the same
 * splice semantics as the editor chain's `ReorderedLayer`, pinned by property
 * tests in `tiles.test.ts`.
 *
 * There is no remove: a collage's photos change by replacement, not deletion
 * (docs/adr/0009-collage).
 */

/** Move one element from index `from` to index `to`. Out-of-range or no-op moves return the array unchanged. */
export const moveTile = <T>(tiles: readonly T[], from: number, to: number): readonly T[] => {
  if (from === to) {
    return tiles
  }
  if (from < 0 || from >= tiles.length || to < 0 || to >= tiles.length) {
    return tiles
  }
  const next = [...tiles]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) {
    return tiles
  }
  next.splice(to, 0, moved)
  return next
}
