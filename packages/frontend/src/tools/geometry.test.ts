import { describe, expect, it } from 'vitest'
import {
  fitGridForCount,
  panAdjust,
  coverSourceRect,
  layoutCells,
  clampGap,
} from './collage/layout'
import { outputGeometry } from './geometry'

describe('outputGeometry', () => {
  it('keeps the output on the target width when a border wraps a 4:5 frame', () => {
    const { canvas, border, photo } = outputGeometry(
      { width: 4000, height: 3000 },
      { width: 1080, height: null, frame: '4:5', borderPercent: 4 },
    )
    // 4% of the frame is 40 px per side; 1080 − 80 leaves a 1000 × 1250 frame.
    expect(border).toBe(40)
    expect(canvas).toEqual({ width: 1000, height: 1250 })
    expect(canvas.width + border * 2).toBe(1080)
    // The landscape photo fits the frame's width, centred on the background.
    expect(photo).toEqual({ width: 1000, height: 750 })
  })

  it('fits a portrait photo by its height inside a landscape frame', () => {
    const { photo } = outputGeometry(
      { width: 2400, height: 3600 },
      { width: 1080, height: null, frame: '16:9', borderPercent: 0 },
    )
    expect(photo).toEqual({ width: 405, height: 608 })
  })

  it('never upscales a photo smaller than the target', () => {
    const { canvas, photo } = outputGeometry(
      { width: 640, height: 480 },
      { width: 1080, height: null, frame: 'original', borderPercent: 0 },
    )
    expect(photo).toEqual({ width: 640, height: 480 })
    expect(canvas).toEqual(photo)
  })
})

describe('collage layout', () => {
  it('grows to the grid with the fewest empty cells, then the most square, capped at nine', () => {
    expect(fitGridForCount(5)).toMatchObject({ rows: 2, cols: 3 })
    expect(fitGridForCount(7)).toMatchObject({ rows: 2, cols: 4 })
    expect(fitGridForCount(12)).toMatchObject({ rows: 3, cols: 3 })
  })

  it('spans a feature cell across the gap it covers', () => {
    const [feature, top] = layoutCells(
      {
        rows: 2,
        cols: 2,
        spans: [
          [0, 0, 2, 1],
          [0, 1, 1, 1],
          [1, 1, 1, 1],
        ],
      },
      210,
      210,
      10,
    )
    expect(feature).toEqual({ x: 0, y: 0, w: 100, h: 210 })
    expect(top).toEqual({ x: 110, y: 0, w: 100, h: 100 })
  })

  it('shrinks a gap that would collapse the cells', () => {
    expect(clampGap({ rows: 1, cols: 4, spans: null }, 100, 100, 40)).toBe(22)
  })

  it('crops a landscape photo to a square cell around the focal point', () => {
    expect(coverSourceRect(400, 300, 100, 100, { zoom: 1, fx: 0, fy: 0.5 })).toEqual({
      sx: 0,
      sy: 0,
      sw: 300,
      sh: 300,
    })
    expect(coverSourceRect(400, 300, 100, 100, { zoom: 2, fx: 1, fy: 1 })).toEqual({
      sx: 250,
      sy: 150,
      sw: 150,
      sh: 150,
    })
  })

  it('reveals the left of the photo when it is dragged right', () => {
    // 400 × 300 in a 100 px cell: 300 source px show, 100 are hidden, at 1/3 scale.
    const moved = panAdjust(400, 300, 100, 100, { zoom: 1, fx: 0.5, fy: 0.5 }, 10, 0)
    expect(moved.fx).toBeCloseTo(0.2)
    // Nothing to pan vertically: the photo's height already fills the cell.
    expect(moved.fy).toBe(0.5)
  })

  it('makes an unlocked height the exact output size, border included', () => {
    const { canvas, border, photo } = outputGeometry(
      { width: 4000, height: 3000 },
      { width: 1000, height: 500, frame: 'original', borderPercent: 4 },
    )
    // 4% of the frame is 37 px per side; the border takes its share of both axes.
    expect(canvas.width + border * 2).toBe(1000)
    expect(canvas.height + border * 2).toBe(500)
    expect(photo.height).toBeLessThanOrEqual(canvas.height)
  })
})
