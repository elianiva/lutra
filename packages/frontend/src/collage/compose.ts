import type { CollageLayout } from '@lutra/store'

/**
 * The collage's grid geometry and composition (docs/adr/0031, 0033): pure
 * rect math plus one 2D-canvas draw step.
 *
 * Geometry flows from the **frame** inward: the layout's frame ratio shapes
 * the composed frame (its short edge pinned to {@link FRAME_SHORT_EDGE}),
 * and cells divide that frame minus the uniform gutter — so a 4:5 preset
 * really does export 4:5, gutters and partial last rows included. Cells are
 * laid out in reading order; unused cells — a partial last row or an explicit
 * M×N grid's spare capacity (docs/adr/0035) — stay background.
 */

/**
 * The composed frame's short edge at export resolution, before the scale
 * preset (docs/adr/0031). Sized so a default grid lands in the same output
 * ballpark as the pre-framing square-cell renderer.
 */
export const FRAME_SHORT_EDGE = 2048

export interface CellSize {
  readonly width: number
  readonly height: number
}

export interface CellRect extends CellSize {
  readonly x: number
  readonly y: number
}

export interface GridGeometry {
  readonly width: number
  readonly height: number
  readonly cells: readonly CellRect[]
}

const rowCount = (count: number, columns: number): number =>
  Math.max(1, Math.ceil(Math.max(0, count) / columns))

/**
 * The **effective** row count (docs/adr/0035): the layout's explicit rows,
 * but never fewer than the tiles demand — legacy records (`rows` decoding to
 * 1) derive rows exactly as before, an explicit M×N is honored whenever its
 * capacity suffices, and surplus photos grow the grid instead of vanishing.
 */
export const effectiveRowCount = (
  layout: Pick<CollageLayout, 'columns' | 'rows'>,
  count: number,
): number => {
  const requested = Number.isFinite(layout.rows) ? Math.max(1, Math.round(layout.rows)) : 1
  return Math.max(requested, rowCount(count, Math.max(1, Math.round(layout.columns))))
}

/**
 * The composed frame's pixel size for `count` tiles: the frame ratio shapes
 * it, the short edge pins the scale. A nonsensical ratio falls back to
 * square.
 */
export const frameSize = (
  layout: Pick<CollageLayout, 'frameRatio'>,
  basis: number = FRAME_SHORT_EDGE,
): CellSize => {
  const ratio = Number.isFinite(layout.frameRatio) && layout.frameRatio > 0 ? layout.frameRatio : 1
  return ratio >= 1
    ? { width: Math.round(basis * ratio), height: Math.round(basis) }
    : { width: Math.round(basis * ratio), height: Math.round(basis) }
}

/** One cell's pixel size: the frame minus its gutters, divided evenly. */
export const cellSize = (
  layout: Pick<CollageLayout, 'columns' | 'rows' | 'gutter' | 'frameRatio'>,
  count: number,
  basis?: number,
): CellSize => {
  const columns = Math.max(1, Math.round(layout.columns))
  const gutter = Math.max(0, Math.round(layout.gutter))
  const rows = effectiveRowCount(layout, count)
  const { width, height } = frameSize(layout, basis)
  return {
    width: Math.max(1, Math.round((width - (columns + 1) * gutter) / columns)),
    height: Math.max(1, Math.round((height - (rows + 1) * gutter) / rows)),
  }
}

/**
 * Pure geometry for `count` tiles in a fixed grid — unit-tested in
 * compose.test.ts. The whole frame measures within a pixel of the frame
 * ratio's promise; cells divide it evenly.
 */
export const gridRects = (
  layout: Pick<CollageLayout, 'columns' | 'rows' | 'gutter' | 'frameRatio'>,
  count: number,
  basis?: number,
): GridGeometry => {
  const columns = Math.max(1, Math.round(layout.columns))
  const gutter = Math.max(0, Math.round(layout.gutter))
  const cell = cellSize(layout, count, basis)
  const rows = effectiveRowCount(layout, count)
  const width = columns * cell.width + (columns + 1) * gutter
  const height = rows * cell.height + (rows + 1) * gutter
  const cells = Array.from({ length: count }, (_, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    return {
      x: gutter + col * (cell.width + gutter),
      y: gutter + row * (cell.height + gutter),
      width: cell.width,
      height: cell.height,
    }
  })
  return { width, height, cells }
}

/**
 * Draw the rendered tiles onto the composed canvas: each tile copies
 * pixel-perfect into its cell over the layout's background. Tiles are
 * rendered (or blank-filled) exactly at the cell size, so there is no
 * resampling and no mismatch path. Cells beyond the tiles (an explicit M×N
 * grid with spare capacity, docs/adr/0035) stay background. Returns the full
 * composed frame as ImageData, ready for the engine encoder.
 */
export const composeGrid = (
  tiles: readonly ImageData[],
  layout: CollageLayout,
  basis?: number,
): ImageData => {
  const { width, height, cells } = gridRects(layout, tiles.length, basis)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D context unavailable')
  }
  ctx.fillStyle = layout.background === 'dark' ? '#000000' : '#ffffff'
  ctx.fillRect(0, 0, width, height)
  // cells has exactly `tiles.length` entries by construction.
  tiles.forEach((tile, i) => {
    const rect = cells[i]!
    ctx.putImageData(tile, rect.x, rect.y)
  })
  return ctx.getImageData(0, 0, width, height)
}
