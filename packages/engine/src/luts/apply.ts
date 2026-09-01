import type { LutCube } from './cube'

export type CubeLayout = {
  readonly size: number
  readonly scale: number
  readonly max: number
}

export const cubeLayoutOf = (cube: LutCube): CubeLayout => ({
  max: cube.size - 1,
  scale: cube.size - 1,
  size: cube.size,
})

export const cubeTexelIndex = (layout: CubeLayout, r: number, g: number, b: number): number =>
  ((b * layout.size + g) * layout.size + r) * 3

export function applyLutCpu(image: ImageData, cube: LutCube, amount = 1): ImageData {
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data.length)
  const { data: cubeData } = cube
  const layout = cubeLayoutOf(cube)
  const { scale, max } = layout

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255
    const g = data[i + 1]! / 255
    const b = data[i + 2]! / 255

    const pr = r * scale
    const pg = g * scale
    const pb = b * scale
    const x0r = Math.floor(pr)
    const x0g = Math.floor(pg)
    const x0b = Math.floor(pb)
    const fr = pr - x0r
    const fg = pg - x0g
    const fb = pb - x0b
    const x1r = x0r + 1 <= max ? x0r + 1 : max
    const x1g = x0g + 1 <= max ? x0g + 1 : max
    const x1b = x0b + 1 <= max ? x0b + 1 : max

    const c000 = cubeTexelIndex(layout, x0r, x0g, x0b)
    const c100 = cubeTexelIndex(layout, x1r, x0g, x0b)
    const c010 = cubeTexelIndex(layout, x0r, x1g, x0b)
    const c110 = cubeTexelIndex(layout, x1r, x1g, x0b)
    const c001 = cubeTexelIndex(layout, x0r, x0g, x1b)
    const c101 = cubeTexelIndex(layout, x1r, x0g, x1b)
    const c011 = cubeTexelIndex(layout, x0r, x1g, x1b)
    const c111 = cubeTexelIndex(layout, x1r, x1g, x1b)

    // mix(a, b, t) = a + (b - a) * t — WGSL mix is the same form.
    const mix = (a: number, b: number, t: number) => a + (b - a) * t

    for (const ch of [0, 1, 2] as const) {
      const v000 = cubeData[c000 + ch]!
      const v100 = cubeData[c100 + ch]!
      const v010 = cubeData[c010 + ch]!
      const v110 = cubeData[c110 + ch]!
      const v001 = cubeData[c001 + ch]!
      const v101 = cubeData[c101 + ch]!
      const v011 = cubeData[c011 + ch]!
      const v111 = cubeData[c111 + ch]!
      const lut = mix(
        mix(mix(v000, v100, fr), mix(v010, v110, fr), fg),
        mix(mix(v001, v101, fr), mix(v011, v111, fr), fg),
        fb,
      )
      // array applies the same 8-bit rounding + clamping the GPU's
      out[i + ch] = mix(data[i + ch]! / 255, lut, amount) * 255
    }
    out[i + 3] = data[i + 3]!
  }

  return new ImageData(out, width, height)
}
