import { describe, it, expect } from 'vitest'
import type { CollageLayout } from '@lutra/store'
import { defaultCollageLayout } from '@lutra/store'
import { FRAME_SHORT_EDGE, cellSize, composeGrid, frameSize, gridRects } from './compose'

const layoutWith = (
  overrides?: Partial<Pick<CollageLayout, 'columns' | 'gutter' | 'frameRatio'>>,
) => ({
  ...defaultCollageLayout(),
  ...overrides,
})

const square = (side: number) => ({ width: side, height: side })

describe('frameSize', () => {
  it('a square ratio pins both edges to the short-edge basis', () => {
    expect(frameSize({ frameRatio: 1 })).toEqual(square(FRAME_SHORT_EDGE))
  })

  it('a portrait frame narrows the width; a landscape frame widens it', () => {
    expect(frameSize({ frameRatio: 4 / 5 })).toEqual({
      width: Math.round(FRAME_SHORT_EDGE * 0.8),
      height: FRAME_SHORT_EDGE,
    })
    expect(frameSize({ frameRatio: 16 / 9 }).width).toBe(Math.round((FRAME_SHORT_EDGE * 16) / 9))
  })

  it('a nonsensical ratio falls back to square', () => {
    expect(frameSize({ frameRatio: 0 })).toEqual(square(FRAME_SHORT_EDGE))
    expect(frameSize({ frameRatio: Number.NaN })).toEqual(square(FRAME_SHORT_EDGE))
  })
})

describe('cellSize / gridRects', () => {
  it('cells divide the frame minus gutters evenly — the grid fills the frame', () => {
    const { width, height, cells } = gridRects(layoutWith(), 3)
    // 3 columns × cell + 4 gutters × 8px (both outer edges included).
    expect(width).toBe(3 * cells[0]!.width + 4 * 8)
    expect(height).toBe(cells[0]!.height + 2 * 8)
    // The composed frame is the promised square (within rounding).
    expect(width).toBeCloseTo(FRAME_SHORT_EDGE, -1)
    expect(height).toBeCloseTo(FRAME_SHORT_EDGE, -1)
  })

  it('a 4:5 frame with zero gutter yields 4:5 output and cells (within a pixel)', () => {
    const layout = layoutWith({ columns: 2, gutter: 0, frameRatio: 4 / 5 })
    const { width, height, cells } = gridRects(layout, 4)
    expect(Math.abs(width / height - 0.8)).toBeLessThan(1 / FRAME_SHORT_EDGE)
    const cell = cells[0]!
    expect(Math.abs(cell.width / cell.height - 0.8)).toBeLessThan(1 / FRAME_SHORT_EDGE)
  })

  it('rows wrap and pad the height of a partial last row — unused cells stay background', () => {
    const { cells, height } = gridRects(layoutWith({ columns: 2 }), 5)
    expect(cells).toHaveLength(5)
    // 3 rows of 2 columns; only the top two rows are full.
    expect(height).toBe(3 * cells[0]!.height + 4 * 8)
    expect(cells[4]).toMatchObject({ x: 8, y: 8 + 2 * (cells[0]!.height + 8) })
  })

  it('a zero gutter produces a seamless grid', () => {
    const { width, height, cells } = gridRects(layoutWith({ gutter: 0 }), 4)
    expect(width).toBe(3 * cells[0]!.width)
    expect(height).toBe(2 * cells[0]!.height)
    expect(cells[3]).toMatchObject({ x: 0, y: cells[0]!.height })
  })

  it('cellSize matches the geometry gridRects lays out', () => {
    const layout = layoutWith({ columns: 3 })
    const cell = cellSize(layout, 7)
    const { cells } = gridRects(layout, 7)
    expect(cells[0]).toMatchObject(cell)
  })
})

describe('composeGrid', () => {
  const canvasAvailable = (() => {
    try {
      return new OffscreenCanvas(1, 1).getContext('2d') !== null
    } catch {
      return false
    }
  })()

  const tileAt = (x: number): ImageData => {
    const t = new ImageData(4, 4)
    t.data.fill(x === 0 ? 10 : x === 1 ? 100 : 200)
    return t
  }

  it.skipIf(!canvasAvailable)('draws tiles into their cells over a dark background', () => {
    const layout = layoutWith({ columns: 2, gutter: 0 })
    const tiles = [tileAt(0), tileAt(1)]
    // Scale down so pixel assertions stay tractable: a 4px short edge.
    const composed = composeGrid(tiles, layout, 4)
    expect(composed.width).toBe(8)
    expect(composed.height).toBe(4)
    // First cell filled with the first tile's gray.
    expect(composed.data[0]).toBe(10)
    // Second cell filled with the second tile's gray.
    expect(composed.data[(4 + 1) * 4]).toBe(100)
  })

  it.skipIf(!canvasAvailable)('missing tiles leave background-filled cells', () => {
    const layout = layoutWith({ columns: 2, gutter: 0 })
    // One tile in a 2-cell grid: the second cell stays dark background.
    const composed = composeGrid([tileAt(0)], layout, 4)
    const secondCellStart = 4 * 4 * 4
    expect(composed.data[secondCellStart]).toBe(0)
    expect(composed.data[secondCellStart + 3]).toBe(255)
  })

  it.skipIf(!canvasAvailable)('a portrait frame ratio composes a portrait frame', () => {
    const layout = layoutWith({ columns: 1, gutter: 0, frameRatio: 1 / 2 })
    const composed = composeGrid([tileAt(0)], layout, 4)
    expect(composed.width).toBe(2)
    expect(composed.height).toBe(4)
  })
})
