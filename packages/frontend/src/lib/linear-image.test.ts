import { describe, expect, it } from 'vitest'
import { toLinearSource } from './linear-image'

// Expected values are derived from the sRGB definition, not read back from
// the implementation: code 0 → 0, code 65535 → 1, and the average of 0 and 1
// in LINEAR light is 0.5 (half-float 0x3800), which encodes to sRGB 188
// (1.055·0.5^(1/2.4) − 0.055 = 0.7354 → 187.5 → 188). Averaging the encoded
// values instead would give 128.

const HALF_ZERO = 0x0000
const HALF_ONE = 0x3c00
const HALF_HALF = 0x3800

describe('toLinearSource', () => {
  it('linearizes sRGB codes to half-floats and pads alpha, keeping the 8-bit bitmap in step', () => {
    const { linear, srgb8 } = toLinearSource(new Uint16Array([0, 65535, 0, 65535, 0, 65535]), 2, 1)
    expect(linear).toMatchObject({ height: 1, width: 2 })
    expect([...linear.data]).toEqual([
      HALF_ZERO,
      HALF_ONE,
      HALF_ZERO,
      HALF_ONE,
      HALF_ONE,
      HALF_ZERO,
      HALF_ONE,
      HALF_ONE,
    ])
    expect([...srgb8]).toEqual([0, 255, 0, 255, 255, 0, 255, 255])
  })

  it('averages in linear light when scaling down', () => {
    // A 2×2 checkerboard of black and white pixels, scaled to 1×1.
    const white = [65535, 65535, 65535]
    const black = [0, 0, 0]
    const checker = new Uint16Array([...white, ...black, ...black, ...white])
    const { linear, srgb8 } = toLinearSource(checker, 2, 2, { height: 1, width: 1 })
    expect(linear).toMatchObject({ height: 1, width: 1 })
    expect([...linear.data]).toEqual([HALF_HALF, HALF_HALF, HALF_HALF, HALF_ONE])
    expect([...srgb8]).toEqual([188, 188, 188, 255])
  })

  it('weights a fractional box by overlap when the ratio is not whole', () => {
    // 3 columns → 2: output 0 covers 1.5 cells (cell 0 fully, cell 1 half).
    // Linear values 1, 0, 1 → (1·1 + 0·0.5) / 1.5 = 2/3 and (0·0.5 + 1·1) / 1.5 = 2/3.
    const px = (v: number) => [v, v, v]
    const row = new Uint16Array([...px(65535), ...px(0), ...px(65535)])
    const { linear } = toLinearSource(row, 3, 1, { height: 1, width: 2 })
    // 2/3 as a half-float: 0x3955 (0.66650…), the nearest binary16.
    expect(linear.data[0]).toBe(0x3955)
    expect(linear.data[4]).toBe(0x3955)
  })
})
