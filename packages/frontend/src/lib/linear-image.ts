import { toHalfFloats } from '../gpu/half-float'

/**
 * A source image in linear light as RGBA half-floats (IEEE 754 binary16
 * bits, alpha 1): what a RAW decode uploads to an `rgba16float` texture so
 * grading starts from 16 bits of sensor precision, not the 8-bit bitmap
 * the rest of the app carries (docs/adr/0008-raw-decode).
 */
export interface LinearImage {
  readonly width: number
  readonly height: number
  readonly data: Uint16Array<ArrayBuffer>
}

export interface LinearSource {
  /** Linear-light RGBA half-floats for the GPU. */
  readonly linear: LinearImage
  /** The same pixels sRGB-encoded to 8 bits: the bitmap every other consumer reads. */
  readonly srgb8: Uint8ClampedArray<ArrayBuffer>
}

const HALF_ONE = 0x3c00
const SRGB_STEPS = 65535

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const linearToSrgb = (l: number): number =>
  l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055

const halfToFloat = (bits: number): number => {
  const sign = bits & 0x8000 ? -1 : 1
  const exponent = (bits >> 10) & 0x1f
  const mantissa = bits & 0x3ff
  if (exponent === 0) {
    return sign * 2 ** -14 * (mantissa / 1024)
  }
  if (exponent === 0x1f) {
    return mantissa === 0 ? sign * Infinity : Number.NaN
  }
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024)
}

let linearFloats: Float32Array<ArrayBuffer> | undefined
let linearHalves: Uint16Array<ArrayBuffer> | undefined
let halfToSrgb8: Uint8Array<ArrayBuffer> | undefined

/** 16-bit sRGB code → linear light, as float (one entry per code). */
const linearFloatTable = (): Float32Array<ArrayBuffer> => {
  if (linearFloats === undefined) {
    const table = new Float32Array(SRGB_STEPS + 1)
    for (let code = 0; code <= SRGB_STEPS; code++) {
      table[code] = srgbToLinear(code / SRGB_STEPS)
    }
    linearFloats = table
  }
  return linearFloats
}

/** 16-bit sRGB code → linear light, as half-float bits. */
const linearHalfTable = (): Uint16Array<ArrayBuffer> => {
  linearHalves ??= toHalfFloats(linearFloatTable())
  return linearHalves
}

/** Half-float bits of a linear value → its sRGB code at 8 bits. */
const srgb8Table = (): Uint8Array<ArrayBuffer> => {
  if (halfToSrgb8 === undefined) {
    const table = new Uint8Array(65536)
    for (let bits = 0; bits < 65536; bits++) {
      const linear = halfToFloat(bits)
      table[bits] =
        Number.isNaN(linear) || linear <= 0
          ? 0
          : Math.round(255 * Math.min(1, linearToSrgb(linear)))
    }
    halfToSrgb8 = table
  }
  return halfToSrgb8
}

interface AxisBin {
  readonly first: number
  readonly weights: Float32Array
}

/** For each output index, the source cells it covers and how much of each. */
const axisBins = (srcLength: number, dstLength: number): AxisBin[] => {
  const scale = srcLength / dstLength
  return Array.from({ length: dstLength }, (_unused, index) => {
    const start = index * scale
    const end = (index + 1) * scale
    const first = Math.floor(start)
    const last = Math.min(srcLength, Math.ceil(end))
    const weights = new Float32Array(last - first)
    for (let cell = first; cell < last; cell++) {
      weights[cell - first] = Math.min(end, cell + 1) - Math.max(start, cell)
    }
    return { first, weights }
  })
}

const encodeSrgb8 = (halves: Uint16Array<ArrayBuffer>): Uint8ClampedArray<ArrayBuffer> => {
  const table = srgb8Table()
  const out = new Uint8ClampedArray(halves.length)
  for (let i = 0; i < halves.length; i += 4) {
    out[i] = table[halves[i]!]!
    out[i + 1] = table[halves[i + 1]!]!
    out[i + 2] = table[halves[i + 2]!]!
    out[i + 3] = 255
  }
  return out
}

/** Pad interleaved RGB codes to RGBA half-floats, linearizing each code. */
const linearizeAtSize = (
  rgb16: Uint16Array<ArrayBuffer>,
  pixels: number,
): Uint16Array<ArrayBuffer> => {
  const table = linearHalfTable()
  const out = new Uint16Array(pixels * 4)
  for (let i = 0; i < pixels; i++) {
    out[i * 4] = table[rgb16[i * 3]!]!
    out[i * 4 + 1] = table[rgb16[i * 3 + 1]!]!
    out[i * 4 + 2] = table[rgb16[i * 3 + 2]!]!
    out[i * 4 + 3] = HALF_ONE
  }
  return out
}

/** Area-average `rgb16` (sRGB codes) down to `width`×`height` in linear light. */
const linearizeResized = (
  rgb16: Uint16Array<ArrayBuffer>,
  srcWidth: number,
  srcHeight: number,
  width: number,
  height: number,
): Uint16Array<ArrayBuffer> => {
  const table = linearFloatTable()
  const columns = axisBins(srcWidth, width)
  const rows = axisBins(srcHeight, height)
  const across = srcWidth / width
  const down = srcHeight / height

  const horizontal = new Float32Array(width * srcHeight * 3)
  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < width; x++) {
      const { first, weights } = columns[x]!
      let r = 0
      let g = 0
      let b = 0
      for (let k = 0; k < weights.length; k++) {
        const at = (y * srcWidth + first + k) * 3
        const weight = weights[k]!
        r += weight * table[rgb16[at]!]!
        g += weight * table[rgb16[at + 1]!]!
        b += weight * table[rgb16[at + 2]!]!
      }
      const out = (y * width + x) * 3
      horizontal[out] = r / across
      horizontal[out + 1] = g / across
      horizontal[out + 2] = b / across
    }
  }

  const resized = new Float32Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const { first, weights } = rows[y]!
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let k = 0; k < weights.length; k++) {
        const at = ((first + k) * width + x) * 3
        const weight = weights[k]!
        r += weight * horizontal[at]!
        g += weight * horizontal[at + 1]!
        b += weight * horizontal[at + 2]!
      }
      const out = (y * width + x) * 4
      resized[out] = r / down
      resized[out + 1] = g / down
      resized[out + 2] = b / down
      resized[out + 3] = 1
    }
  }
  return toHalfFloats(resized)
}

/**
 * Turn an oriented, sRGB-encoded 16-bit RGB decode into both source forms:
 * linear half-floats for the GPU and 8-bit sRGB for the bitmap. When
 * `target` is smaller than the decode it is area-averaged in linear light
 * (averaging encoded values would darken edges).
 */
export const toLinearSource = (
  rgb16: Uint16Array<ArrayBuffer>,
  width: number,
  height: number,
  target: { readonly width: number; readonly height: number } = { height, width },
): LinearSource => {
  const resize = target.width < width || target.height < height
  const data = resize
    ? linearizeResized(rgb16, width, height, target.width, target.height)
    : linearizeAtSize(rgb16, width * height)
  const size = resize ? target : { height, width }
  return {
    linear: { data, height: size.height, width: size.width },
    srgb8: encodeSrgb8(data),
  }
}
