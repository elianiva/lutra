import { describe, it, expect } from 'vitest'
import {
  MAX_ZOOM,
  clampFraming,
  fitZoom,
  isDefaultFraming,
  panned,
  placement,
  zoomed,
} from './framing'
import { defaultTileFraming } from '@lutra/store'

/** A square photo in a square cell: cover == fit, no overflow anywhere. */
const SQUARE = 1
/** A 2:1 photo (wide) in a square cell. */
const WIDE = 2
/** A 1:2 photo (tall) in a square cell. */
const TALL = 0.5

describe('fitZoom', () => {
  it('a photo matching the cell aspect fits at exactly cover', () => {
    expect(fitZoom(SQUARE, SQUARE)).toBe(1)
  })

  it('a wide photo in a square cell fits below cover', () => {
    // Cover draws it 2 cells wide; fitting needs half that.
    expect(fitZoom(WIDE, SQUARE)).toBeCloseTo(0.5)
  })

  it('a tall photo in a square cell fits below cover', () => {
    expect(fitZoom(TALL, SQUARE)).toBeCloseTo(0.5)
  })
})

describe('placement', () => {
  it('the default framing centers a cover-cropped photo with no bars', () => {
    const p = placement(defaultTileFraming(), WIDE, SQUARE)
    expect(p.width).toBeCloseTo(2)
    expect(p.height).toBeCloseTo(1)
    expect(p.left).toBeCloseTo(-0.5)
    expect(p.top).toBeCloseTo(0)
  })

  it('zooming out below cover clamps to cover and never shows bars (PicsArt-like)', () => {
    const z = clampFraming({ zoom: 0.4, focusX: 0.5, focusY: 0.5 }, WIDE, SQUARE)
    expect(z.zoom).toBeCloseTo(1)
    const p = placement(z, WIDE, SQUARE)
    expect(p.width).toBeCloseTo(2)
    expect(p.height).toBeCloseTo(1)
    expect(p.left).toBeCloseTo(-0.5)
    expect(p.top).toBeCloseTo(0)
  })

  it('focus pans within the overflow and clamps at the edges', () => {
    const left = placement({ zoom: 1, focusX: 0, focusY: 0.5 }, WIDE, SQUARE)
    expect(left.left).toBeCloseTo(0)
    const right = placement({ zoom: 1, focusX: 1, focusY: 0.5 }, WIDE, SQUARE)
    expect(right.left).toBeCloseTo(-1)
    // Out-of-range focus clamps instead of showing background.
    const beyond = placement({ zoom: 1, focusX: 42, focusY: 0.5 }, WIDE, SQUARE)
    expect(beyond.left).toBeCloseTo(-1)
  })

  it('an axis without overflow stays centered regardless of focus', () => {
    const p = placement({ zoom: 1, focusX: 0.5, focusY: 0.9 }, WIDE, SQUARE)
    expect(p.top).toBeCloseTo(0)
  })

  it('non-square cells derive from the cell aspect', () => {
    // A 4:5 cell (aspect 0.8) with a square photo: cover fills the height,
    // so the photo overflows horizontally.
    const p = placement(defaultTileFraming(), SQUARE, 0.8)
    expect(p.width).toBeCloseTo(1 / 0.8)
    expect(p.height).toBeCloseTo(1)
    expect(p.left).toBeLessThan(0)
    expect(p.top).toBeCloseTo(0)
  })
})

describe('panned', () => {
  it('follows the pointer delta and clamps at the photo edge', () => {
    const start = defaultTileFraming()
    // Dragging right by half a cell moves the visible window left.
    const dragged = panned(start, WIDE, SQUARE, 0.25, 0)
    expect(dragged.focusX).toBeLessThan(start.focusX)
    const maxed = panned(start, WIDE, SQUARE, 10, 0)
    expect(placement(maxed, WIDE, SQUARE).left).toBeCloseTo(0)
  })

  it('keeps zoom unchanged', () => {
    const framed = { zoom: 2, focusX: 0.5, focusY: 0.5 }
    expect(panned(framed, WIDE, SQUARE, 0.1, 0.1).zoom).toBe(2)
  })
})

describe('zoomed', () => {
  it('multiplies the zoom and clamps into [1, 4×cover] (PicsArt-like: never below cover)', () => {
    expect(zoomed(defaultTileFraming(), 2, WIDE, SQUARE).zoom).toBe(2)
    expect(zoomed(defaultTileFraming(), 100, WIDE, SQUARE).zoom).toBe(MAX_ZOOM)
    expect(zoomed(defaultTileFraming(), 0.001, WIDE, SQUARE).zoom).toBeCloseTo(1)
  })

  it('clamping the focus after zoom-in keeps the photo covering the cell', () => {
    const edge = { zoom: 1, focusX: 1, focusY: 0.5 }
    const in_ = zoomed(edge, 2, WIDE, SQUARE)
    // Zooming in around an edge-anchored focus must never reveal background.
    const p = placement(in_, WIDE, SQUARE)
    expect(p.left).toBeLessThanOrEqual(0.000001)
    expect(p.left + p.width).toBeGreaterThanOrEqual(1 - 0.000001)
  })
})

describe('isDefaultFraming', () => {
  it('matches only the untouched default', () => {
    expect(isDefaultFraming(defaultTileFraming())).toBe(true)
    expect(isDefaultFraming({ zoom: 1, focusX: 0.5, focusY: 0.4 })).toBe(false)
    expect(isDefaultFraming({ zoom: 1.5, focusX: 0.5, focusY: 0.5 })).toBe(false)
  })
})
