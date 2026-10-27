/**
 * Convert f32 values to IEEE 754 half-float bits (round to nearest even),
 * for uploading data to `*16float` textures: `writeTexture` copies bytes
 * verbatim and does no format conversion.
 */
export const toHalfFloats = (values: Float32Array): Uint16Array<ArrayBuffer> => {
  const f32 = new Float32Array(1)
  const bits = new Uint32Array(f32.buffer)
  const out = new Uint16Array(values.length)
  for (let i = 0; i < values.length; i++) {
    f32[0] = values[i]!
    const x = bits[0]!
    const sign = (x >>> 16) & 0x8000
    const exp = (x >>> 23) & 0xff
    const mant = x & 0x7fffff
    if (exp === 0xff) {
      // Inf / NaN.
      out[i] = sign | 0x7c00 | (mant === 0 ? 0 : 0x200)
      continue
    }
    const e = exp - 127 + 15
    if (e >= 0x1f) {
      out[i] = sign | 0x7c00
    } else if (e <= 0) {
      // Subnormal half (or zero): shift the implicit-1 mantissa into place.
      if (e < -10) {
        out[i] = sign
        continue
      }
      const m = mant | 0x800000
      const shift = 14 - e
      const half = m >>> shift
      const rem = m & ((1 << shift) - 1)
      const mid = 1 << (shift - 1)
      out[i] = sign | (half + (rem > mid || (rem === mid && (half & 1) === 1) ? 1 : 0))
    } else {
      const half = (e << 10) | (mant >>> 13)
      const rem = mant & 0x1fff
      // Carry from rounding can roll into the exponent — that is correct.
      out[i] = sign | (half + (rem > 0x1000 || (rem === 0x1000 && (half & 1) === 1) ? 1 : 0))
    }
  }
  return out
}
