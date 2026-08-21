import { describe, it, expect } from 'vitest'
import type { CollageLayout } from '@lutra/store'
import { defaultCollageLayout } from '@lutra/store'
import { CELL_SIZE, composeGrid, gridRects } from './compose'

const layoutWith = (overrides?: Partial<Pick<CollageLayout, 'columns' | 'gutter'>>) => ({
  ...defaultCollageLayout(),
  ...overrides,
})

describe('gridRects', () => {
  it('the default 3-column, 8px gutter grid places cells in reading order with outer padding', () => {
    const { width, height, cells } = gridRects(layoutWith(), 3)
    // 3 columns × 1024px + 4 gutters × 8px (both outer edges included).
    expect(width).toBe(3 * CELL_SIZE + 4 * 8)
    expect(height).toBe(CELL_SIZE + 2 * 8)
    expect(cells.map((c) => c.x)).toEqual([8, 8 + CELL_SIZE + 8, 8 + 2 * (CELL_SIZE + 8)])
    expect(cells.map((c) => c.y)).toEqual([8, 8, 8])
    expect(cells.every((c) => c.width === CELL_SIZE && c.height === CELL_SIZE)).toBe(true)
  })

  it('rows wrap and pad the height of a partial last row — unused cells stay background', () => {
    const { width, height, cells } = gridRects(layoutWith({ columns: 2 }), 5)
    expect(cells).toHaveLength(5)
    // 3 rows of 2 columns; only the top two rows are full.
    expect(height).toBe(3 * CELL_SIZE + 4 * 8)
    expect(width).toBe(2 * CELL_SIZE + 3 * 8)
    expect(cells[4]).toMatchObject({ x: 8, y: 8 + 2 * (CELL_SIZE + 8) })
  })

  it('a zero gutter produces a seamless grid', () => {
    const { width, height, cells } = gridRects(layoutWith({ gutter: 0 }), 4)
    expect(width).toBe(3 * CELL_SIZE)
    expect(height).toBe(2 * CELL_SIZE)
    expect(cells[3]).toMatchObject({ x: 0, y: CELL_SIZE })
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

  it.skipIf(!canvasAvailable)(
    'draws tiles into their cells over a dark background',
    () => {
      const layout = layoutWith({ columns: 2, gutter: 0 })
      const tiles = [tileAt(0), tileAt(1)]
      // Scale the cell down so pixel assertions stay tractable: a 4px cell.
      const composed = composeGrid(tiles, layout, 4)
      expect(composed.width).toBe(8)
      expect(composed.height).toBe(4)
      // First cell filled with the first tile's gray.
      expect(composed.data[0]).toBe(10)
      // Second cell filled with the second tile's gray.
      expect(composed.data[(4 + 1) * 4]).toBe(100)
    },
  )

  it.skipIf(!canvasAvailable)(
    'missing tiles leave background-filled cells',
    () => {
      const layout = layoutWith({ columns: 2, gutter: 0 })
      // One tile in a 2-cell grid: the second cell stays dark background.
      const composed = composeGrid([tileAt(0)], layout, 4)
      const secondCellStart = (4 * 4) * 4
      expect(composed.data[secondCellStart]).toBe(0)
      expect(composed.data[secondCellStart + 3]).toBe(255)
    },
  )
})
