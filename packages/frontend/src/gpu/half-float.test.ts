import { describe, it, expect } from 'vitest'
import { toHalfFloats } from './half-float'

describe('toHalfFloats', () => {
  it('encodes normals, rounding ties to even, overflow, and subnormals', () => {
    const cases: readonly (readonly [number, number])[] = [
      [0, 0x0000],
      [1, 0x3c00],
      [-2, 0xc000],
      [0.5, 0x3800],
      [0.1, 0x2e66],
      [65504, 0x7bff],
      [65520, 0x7c00],
      [Infinity, 0x7c00],
      [1 + 2 ** -11, 0x3c00],
      [1 + 3 * 2 ** -11, 0x3c02],
      [2 ** -24, 0x0001],
      [1e-7, 0x0002],
      [2 ** -26, 0x0000],
    ]
    const out = toHalfFloats(new Float32Array(cases.map(([v]) => v)))
    expect([...out]).toEqual(cases.map(([, bits]) => bits))
  })
})
