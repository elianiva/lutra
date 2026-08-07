import { describe, it, expect } from "vitest"
import { applyLutCpu } from "./apply"
import { parseCube } from "./cube"

// A size-2 cube with texel (0,0,0) = black, texel (1,1,1) = white, and every
// other texel mid-gray — hand-computable trilinear results. Row-major layout
// ((r*size + g)*size + b) * 3, exactly what parseCube emits.
const midGrayCube = () => {
  const data = new Float32Array(8 * 3).fill(0.5)
  // texel (0,0,0) -> black
  data[0] = 0
  data[1] = 0
  data[2] = 0
  // texel (1,1,1) -> white
  data[21] = 1
  data[22] = 1
  data[23] = 1
  return { size: 2, data }
}

const image = (px: ReadonlyArray<number>) => new ImageData(new Uint8ClampedArray(px), 1, 1)

describe("applyLutCpu", () => {
  it("matches the shader's trilinear sampling on hand-computed values", () => {
    // Input (0.25, 0.25, 0.25): p = 0.25 * 1, f = 0.25 on every axis.
    // x-lerps: 0 -> 0.5 at 0.25 = 0.125, 0.5 -> 0.5 = 0.5, 0.5 -> 0.5 = 0.5,
    // 0.5 -> 1 at 0.25 = 0.625; y-lerps: 0.125 -> 0.5 at 0.25 = 0.21875,
    // 0.5 -> 0.625 at 0.25 = 0.53125; z-lerp: 0.21875 -> 0.53125 at 0.25 =
    // 0.296875 -> byte 75.703 -> 76.
    const out = applyLutCpu(image([64, 64, 64, 255]), midGrayCube(), 1)
    expect(out.data[0]).toBe(76)
    expect(out.data[1]).toBe(76)
    expect(out.data[2]).toBe(76)
    expect(out.data[3]).toBe(255)
  })

  it("collapses to the corner texel at full-scale coordinates", () => {
    // Input (1, 0, 0): p = (1, 0, 0), f = 0 everywhere -> the lerps collapse
    // to texel (1,0,0) = mid-gray (0.5) -> byte 127.5 -> 128.
    const out = applyLutCpu(image([255, 0, 0, 128]), midGrayCube(), 1)
    expect(out.data[0]).toBe(128)
    expect(out.data[1]).toBe(128)
    expect(out.data[2]).toBe(128)
    // Alpha passes through untouched (the shader stores it unmodified).
    expect(out.data[3]).toBe(128)
  })

  it("amount 0 leaves the image unchanged", () => {
    const out = applyLutCpu(image([10, 200, 90, 255]), midGrayCube(), 0)
    expect(out.data[0]).toBe(10)
    expect(out.data[1]).toBe(200)
    expect(out.data[2]).toBe(90)
  })

  it("applies a half-strength mix between source and LUT", () => {
    // (1,0,0) with amount 0.5: 0.5*(1,0,0) + 0.5*(0.5,0.5,0.5) = (0.75, 0.25, 0.25)
    const out = applyLutCpu(image([255, 0, 0, 255]), midGrayCube(), 0.5)
    expect(out.data[0]).toBe(191) // 0.75 * 255 = 191.25
    expect(out.data[1]).toBe(64) // 0.25 * 255 = 63.75
    expect(out.data[2]).toBe(64)
  })

  it("works on a cube produced by parseCube", () => {
    // File point order: red varies fastest — point i is texel
    // (r = i % 2, g = (i / 2) % 2, b = i / 4) where the output is the
    // texel's own coordinates: an identity cube.
    const cube = parseCube(
      [
        "LUT_3D_SIZE 2",
        "0 0 0",
        "1 0 0",
        "0 1 0",
        "1 1 0",
        "0 0 1",
        "1 0 1",
        "0 1 1",
        "1 1 1",
      ].join("\n"),
    )
    // A linear cube: applying it is the identity on every channel.
    const out = applyLutCpu(image([13, 27, 240, 255]), cube, 1)
    expect(out.data[0]).toBe(13)
    expect(out.data[1]).toBe(27)
    expect(out.data[2]).toBe(240)
  })

  it("reads the red axis from the file's fastest-varying points", () => {
    // A cube whose red-axis step (file point 1) is red and whose blue-axis
    // step (file point size² = 4) is blue, everything else mid-gray. Under
    // the file's red-fastest order, pure red input must come out red — a
    // red/blue swap in the sampler would answer blue here.
    const cube = {
      size: 2,
      data: new Float32Array(8 * 3).fill(0.5),
    }
    const d = cube.data
    d[0] = 0
    d[1] = 0
    d[2] = 0 // point 0 = (0,0,0): black
    d[3] = 1
    d[4] = 0
    d[5] = 0 // point 1 = (1,0,0): red
    d[12] = 0
    d[13] = 0
    d[14] = 1 // point 4 = (0,0,1): blue
    d[21] = 1
    d[22] = 1
    d[23] = 1 // point 7 = (1,1,1): white
    const red = applyLutCpu(image([255, 0, 0, 255]), cube, 1)
    expect(red.data[0]).toBe(255)
    expect(red.data[1]).toBe(0)
    expect(red.data[2]).toBe(0)
    const blue = applyLutCpu(image([0, 0, 255, 255]), cube, 1)
    expect(blue.data[0]).toBe(0)
    expect(blue.data[1]).toBe(0)
    expect(blue.data[2]).toBe(255)
  })

  it("does not mutate the input image", () => {
    const input = image([200, 100, 50, 255])
    applyLutCpu(input, midGrayCube(), 1)
    expect(input.data[0]).toBe(200)
    expect(input.data[1]).toBe(100)
    expect(input.data[2]).toBe(50)
  })
})
