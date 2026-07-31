import { describe, it, expect } from "vitest"
import { parseCube, LutParseError } from "./cube"

const CUBE_2 = `# comment
TITLE "test"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
0.5 0.0 0.0
0.0 0.5 0.0
0.5 0.5 0.0
0.0 0.0 0.5
0.5 0.0 0.5
0.0 0.5 0.5
0.5 0.5 0.5
`

describe("parseCube", () => {
  it("parses a minimal cube with headers and comments", () => {
    const cube = parseCube(CUBE_2)
    expect(cube.size).toBe(2)
    expect(cube.data).toHaveLength(8 * 3)
    expect(cube.data[0]).toBe(0)
    expect(cube.data[1]).toBe(0)
    expect(cube.data[3]).toBe(0.5)
    // Row-major: index (r*size+g)*size+b — last entry is (1,1,1)
    expect(cube.data[21]).toBe(0.5)
  })

  it("tolerates CRLF line endings and extra columns", () => {
    const cube = parseCube(
      [
        "LUT_3D_SIZE 2",
        "0 0 0 1",
        "0.5 0 0 1",
        "0 0.5 0 1",
        "0.5 0.5 0 1",
        "0 0 0.5 1",
        "0.5 0 0.5 1",
        "0 0.5 0.5 1",
        "0.5 0.5 0.5 1",
      ].join("\r\n"),
    )
    expect(cube.size).toBe(2)
    expect(cube.data).toHaveLength(24)
    // Extra (alpha) column ignored: point 2's red is 0.5, and the alpha
    // value 1 never lands in the data (data[3] would be 1 if it did)
    expect(cube.data[3]).toBe(0.5)
    expect(cube.data[4]).toBe(0)
  })

  it("parses the vendored 13³ cube shape", () => {
    const lines = ["LUT_3D_SIZE 13"]
    for (let i = 0; i < 13 * 13 * 13; i++) {
      lines.push(`${i * 0.001} ${i * 0.002} ${i * 0.003}`)
    }
    const cube = parseCube(lines.join("\n"))
    expect(cube.size).toBe(13)
    expect(cube.data).toHaveLength(13 * 13 * 13 * 3)
  })

  it("fails on a missing size header", () => {
    expect(() => parseCube("0 0 0\n0.5 0.5 0.5\n")).toThrow(LutParseError)
  })

  it("fails on an invalid size", () => {
    expect(() => parseCube("LUT_3D_SIZE abc\n")).toThrow(LutParseError)
    expect(() => parseCube("LUT_3D_SIZE 1\n0 0 0\n")).toThrow(LutParseError)
  })

  it("fails on a wrong data point count", () => {
    const text = "LUT_3D_SIZE 2\n0 0 0\n0.5 0.5 0.5\n"
    expect(() => parseCube(text)).toThrow(/Expected 8 data points/)
  })

  it("fails on malformed data lines", () => {
    const text = "LUT_3D_SIZE 2\n0 0\n0.5 0.5 0.5\n"
    expect(() => parseCube(text)).toThrow(LutParseError)
  })
})
