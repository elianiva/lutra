import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { applyLutCpu } from './apply'
import type { LutCube } from './cube'

const channel = fc.integer({ max: 255, min: 0 })
const amountArb = fc.float({ max: 1, min: 0, noDefaultInfinity: true, noNaN: true })

const imageArb = fc
  .tuple(fc.integer({ max: 8, min: 1 }), fc.integer({ max: 8, min: 1 }))
  .chain(([width, height]) =>
    fc
      .array(channel, { maxLength: width * height * 4, minLength: width * height * 4 })
      .map((px) => new ImageData(new Uint8ClampedArray(px), width, height)),
  )

/** A cube of a fixed size with arbitrary texel values. */
const cubeOfSize = (size: number) =>
  fc
    .array(fc.float({ max: 1, min: 0, noDefaultInfinity: true, noNaN: true }), {
      maxLength: size * size * size * 3,
      minLength: size * size * size * 3,
    })
    .map((values): LutCube => ({
      data: new Float32Array(values.map((v) => (v === 0 ? 0 : v))),
      size,
    }))

const cubeArb = fc.integer({ max: 8, min: 2 }).chain(cubeOfSize)

const sceneArb = fc.record({ amount: amountArb, cube: cubeArb, image: imageArb })

/**
 * A textbook trilinear sampler, deliberately structured differently from
 * the implementation (sum of corner texels weighted by the product of the
 * per-axis weights, instead of nested `mix` calls): an axis-order or
 * mix-order bug in `applyLutCpu` shows up as a byte-level mismatch.
 */
const referenceApply = (image: ImageData, cube: LutCube, amount: number): Uint8ClampedArray => {
  const { size, data } = cube
  const scale = size - 1
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const out = new Uint8ClampedArray(image.data.length)

  for (let i = 0; i < image.data.length; i += 4) {
    const c = [image.data[i]! / 255, image.data[i + 1]! / 255, image.data[i + 2]! / 255]
    const p = c.map((v) => v * scale)
    const x0 = p.map(Math.floor)
    const f = p.map((v, k) => v - x0[k]!)
    const x1 = x0.map((v) => Math.min(v + 1, size - 1))

    const lut = [0, 0, 0]
    for (let corner = 0; corner < 8; corner++) {
      const rr = corner & 1 ? x1[0]! : x0[0]!
      const gg = corner & 2 ? x1[1]! : x0[1]!
      const bb = corner & 4 ? x1[2]! : x0[2]!
      const wr = corner & 1 ? f[0]! : 1 - f[0]!
      const wg = corner & 2 ? f[1]! : 1 - f[1]!
      const wb = corner & 4 ? f[2]! : 1 - f[2]!
      const idx = ((bb * size + gg) * size + rr) * 3
      for (let ch = 0; ch < 3; ch++) {
        lut[ch]! += data[idx + ch]! * wr * wg * wb
      }
    }
    for (let ch = 0; ch < 3; ch++) {
      out[i + ch] = lerp(image.data[i + ch]! / 255, lut[ch]!, amount) * 255
    }
    out[i + 3] = image.data[i + 3]!
  }
  return out
}

/** The identity cube: texel (r, g, b) stores its own coordinates. */
const identityCube = (size: number): LutCube => {
  const data = new Float32Array(size * size * size * 3)
  const scale = size - 1
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const idx = ((b * size + g) * size + r) * 3
        data[idx] = r / scale
        data[idx + 1] = g / scale
        data[idx + 2] = b / scale
      }
    }
  }
  return { data, size }
}

describe('applyLutCpu', () => {
  it('matches a reference trilinear sampler on any image, cube, and amount', () => {
    fc.assert(
      fc.property(sceneArb, ({ image, cube, amount }) => {
        const out = applyLutCpu(image, cube, amount)
        const ref = referenceApply(image, cube, amount)
        for (let i = 0; i < out.data.length; i++) {
          // The two formulations round differently only at byte boundaries.
          expect(Math.abs(out.data[i]! - ref[i]!)).toBeLessThanOrEqual(1)
        }
      }),
    )
  })

  it('amount 0 leaves every pixel byte-identical', () => {
    fc.assert(
      fc.property(sceneArb, ({ image, cube }) => {
        const out = applyLutCpu(image, cube, 0)
        for (let i = 0; i < image.data.length; i++) {
          expect(out.data[i]).toBe(image.data[i])
        }
      }),
    )
  })

  it('passes the alpha channel through untouched', () => {
    fc.assert(
      fc.property(sceneArb, ({ image, cube, amount }) => {
        const out = applyLutCpu(image, cube, amount)
        for (let i = 3; i < image.data.length; i += 4) {
          expect(out.data[i]).toBe(image.data[i])
        }
      }),
    )
  })

  it('applying the identity cube is the identity on every channel', () => {
    fc.assert(
      fc.property(
        fc.tuple(imageArb, fc.integer({ max: 8, min: 2 }), amountArb),
        ([image, size, amount]) => {
          const out = applyLutCpu(image, identityCube(size), amount)
          for (let i = 0; i < image.data.length; i++) {
            // Trilinear interpolation of the identity mapping is exact in
            // theory; float rounding can land one byte off the original.
            expect(Math.abs(out.data[i]! - image.data[i]!)).toBeLessThanOrEqual(1)
          }
        },
      ),
    )
  })

  it('collapses to the corner texel at texel-center coordinates', () => {
    // Sizes where 255 is divisible by size-1 (2 and 16): the byte
    // k * 255/(size-1) maps to the exact texel k/(size-1), so the lerps
    // collapse and the output is that texel's own value.
    fc.assert(
      fc.property(
        fc
          .constantFrom(2, 16)
          .chain((size) =>
            fc.tuple(fc.constant(size), fc.integer({ max: size - 1, min: 0 }), cubeOfSize(size)),
          ),
        ([size, k, cube]) => {
          const byte = (k * 255) / (size - 1)
          const input = new ImageData(new Uint8ClampedArray([byte, byte, byte, 255]), 1, 1)
          const out = applyLutCpu(input, cube, 1)
          const texelIndex = ((k * size + k) * size + k) * 3
          for (const ch of [0, 1, 2]) {
            const expected = Math.round(cube.data[texelIndex + ch]! * 255)
            expect(Math.abs(out.data[ch]! - expected)).toBeLessThanOrEqual(1)
          }
          expect(out.data[3]).toBe(255)
        },
      ),
    )
  })

  it('does not mutate the input image', () => {
    fc.assert(
      fc.property(sceneArb, ({ image, cube, amount }) => {
        const before = new Uint8ClampedArray(image.data)
        applyLutCpu(image, cube, amount)
        for (let i = 0; i < before.length; i++) {
          expect(image.data[i]).toBe(before[i])
        }
      }),
    )
  })
})
