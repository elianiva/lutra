import type { CollageLayout } from '@lutra/store'

/**
 * The collage's grid geometry and composition (docs/adr/0031): pure rect
 * math plus one 2D-canvas draw step. Cells are square, laid out in reading
 * order with a uniform gutter — including the outer edge — on the layout's
 * background. The last row's unused cells stay background.
 */

/** Export composes at fixed square cells before the scale preset (docs/adr/0031). */
export const CELL_SIZE = 1024

export interface CellRect {
  readonly x: number
  readonly y: number
  /** Always `CELL_SIZE` — tiles center-crop into the square cell. */
  readonly width: number
  readonly height: number
}

export interface GridGeometry {
  readonly width: number
  readonly height: number
  readonly cells: readonly CellRect[]
}

/** Pure geometry for `count` tiles in a fixed grid — unit-tested in compose.test.ts. */
export const gridRects = (
  layout: Pick<CollageLayout, 'columns' | 'gutter'>,
  count: number,
  cellSize = CELL_SIZE,
): GridGeometry => {
  const columns = Math.max(1, Math.round(layout.columns))
  const gutter = Math.max(0, Math.round(layout.gutter))
  const rows = Math.max(1, Math.ceil(count / columns))
  const width = columns * cellSize + (columns + 1) * gutter
  const height = rows * cellSize + (rows + 1) * gutter
  const cells = Array.from({ length: count }, (_, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    return {
      x: gutter + col * (cellSize + gutter),
      y: gutter + row * (cellSize + gutter),
      width: cellSize,
      height: cellSize,
    }
  })
  return { width, height, cells }
}

/**
 * Draw the rendered tiles onto the composed canvas: each tile
 * center-cropped into its square cell over the layout's background. Returns
 * the full composed frame as ImageData, ready for the engine encoder.
 */
export const composeGrid = (
  tiles: readonly ImageData[],
  layout: CollageLayout,
  cellSize = CELL_SIZE,
): ImageData => {
  const { width, height, cells } = gridRects(layout, tiles.length, cellSize)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D context unavailable')
  }
  ctx.fillStyle = layout.background === 'dark' ? '#000000' : '#ffffff'
  ctx.fillRect(0, 0, width, height)
  tiles.forEach((tile, i) => {
    const cell = cells[i]
    if (!cell) {
      return
    }
    if (tile.width === cell.width && tile.height === cell.height) {
      // Exact-size tiles copy pixel-perfect with no resampling.
      ctx.putImageData(tile, cell.x, cell.y)
      return
    }
    // Mismatched tiles (defensive) center-crop into the square cell via a
    // scratch canvas — ImageData itself is not a drawImage source.
    const side = Math.min(tile.width, tile.height)
    const sx = (tile.width - side) / 2
    const sy = (tile.height - side) / 2
    const scratch = new OffscreenCanvas(tile.width, tile.height)
    const sctx = scratch.getContext('2d')
    if (!sctx) {
      throw new Error('2D context unavailable')
    }
    sctx.putImageData(tile, 0, 0)
    ctx.drawImage(scratch, sx, sy, side, side, cell.x, cell.y, cell.width, cell.height)
  })
  return ctx.getImageData(0, 0, width, height)
}
