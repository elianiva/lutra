import { describe, it, expect } from 'vitest'
import { canvasDimensionsEqual, canvasDimensionsOf, sessionKeyEquals, toSessionKey } from './session-key'

describe('session-key', () => {
  it('equals when canvas identity, image size and bitmap match', () => {
    const canvas = { width: 100, height: 100 } as HTMLCanvasElement
    const bitmap = {} as ImageBitmap
    const a = toSessionKey(canvas, 800, 600, bitmap)
    const b = toSessionKey(canvas, 800, 600, bitmap)
    expect(sessionKeyEquals(a, b)).toBe(true)
  })
  it('differs when image dimensions differ', () => {
    const canvas = {} as HTMLCanvasElement
    const bitmap = {} as ImageBitmap
    const a = toSessionKey(canvas, 800, 600, bitmap)
    const b = toSessionKey(canvas, 1024, 600, bitmap)
    expect(sessionKeyEquals(a, b)).toBe(false)
  })
  it('differs when canvas identity differs', () => {
    const c1 = {} as HTMLCanvasElement
    const c2 = {} as HTMLCanvasElement
    const bitmap = {} as ImageBitmap
    const a = toSessionKey(c1, 100, 100, bitmap)
    const b = toSessionKey(c2, 100, 100, bitmap)
    expect(sessionKeyEquals(a, b)).toBe(false)
  })
  it('differs when bitmap differs', () => {
    const canvas = {} as HTMLCanvasElement
    const b1 = {} as ImageBitmap
    const b2 = {} as ImageBitmap
    const a = toSessionKey(canvas, 100, 100, b1)
    const b = toSessionKey(canvas, 100, 100, b2)
    expect(sessionKeyEquals(a, b)).toBe(false)
  })
  it('canvasDimensions helpers', () => {
    const canvas = { width: 200, height: 150 } as HTMLCanvasElement
    expect(canvasDimensionsOf(canvas)).toEqual({ width: 200, height: 150 })
    expect(canvasDimensionsEqual({ width: 200, height: 150 }, { width: 200, height: 150 })).toBe(true)
    expect(canvasDimensionsEqual({ width: 200, height: 150 }, { width: 400, height: 150 })).toBe(false)
  })
})
