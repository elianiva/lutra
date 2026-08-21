/**
 * Tile-array operations for the collage (docs/adr/0030). Position IS the
 * array index in reading order, so remove and reorder are plain array ops —
 * the same splice semantics as the editor chain's `ReorderedLayer`, pinned
 * by property tests in `tiles.test.ts`.
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

/** Remove the element at `index`. An out-of-range index returns the array unchanged. */
export const removeTile = <T>(tiles: readonly T[], index: number): readonly T[] => {
  if (index < 0 || index >= tiles.length) {
    return tiles
  }
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)]
}
