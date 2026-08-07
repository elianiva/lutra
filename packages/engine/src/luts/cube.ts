/**
 * Parsing for 3D color cubes in the `.cube` format (the vendored G'MIC
 * film LUTs). The engine stays pure: `parseCube` turns text into a
 * `LutCube`; fetching bytes and uploading the GPU texture are the
 * frontend's concern.
 *
 * The vendored LUTs are 13³ cubes with `DOMAIN_MIN/MAX 0..1`; the parser
 * reads the size and the data points and ignores everything else. It is
 * tolerant of the minor format variations seen in the wild (blank lines,
 * comments, extra columns) but strict about the one thing that matters:
 * exactly `size³` data points.
 */

import { Schema } from "effect"

/** A parsed 3D color cube. `data` holds `size³ × 3` floats in the file's
 * point order — for the vendored G'MIC cubes that is index
 * `(b * size + g) * size + r`: the red channel varies fastest, blue slowest
 * (verified against the upstream data, where point index 1 is the red-axis
 * step). The GPU backend strides this same order into the 3D texture, so
 * the texture's X/Y/Z axes are the file's red/green/blue channels and the
 * shader can sample `color.rgb` as the texture coordinate directly. */
export interface LutCube {
  readonly size: number
  /** `size³ × 3` floats, file point order (red fastest for the vendored cubes). */
  readonly data: Float32Array
}

export class LutParseError extends Schema.TaggedErrorClass<LutParseError>()(
  "LutParseError",
  {
    message: Schema.String,
  },
) {}

const SIZE_RE = /^LUT_3D_SIZE\s+(\d+)/

/**
 * Parse `.cube` text into a `LutCube`. Throws `LutParseError` on malformed
 * input (missing or invalid size, wrong data point count, non-numeric
 * values). Lines other than the size header and data points — `TITLE`,
 * `DOMAIN_MIN/MAX`, comments, blanks — are ignored.
 */
export function parseCube(text: string): LutCube {
  let size = 0
  const values: number[] = []

  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#")) continue

    const sizeMatch = SIZE_RE.exec(line)
    if (sizeMatch) {
      size = Number(sizeMatch[1])
      if (!Number.isInteger(size) || size < 2) {
        throw new LutParseError({ message: `Invalid LUT_3D_SIZE: ${line}` })
      }
      continue
    }

    if (line.startsWith("TITLE") || line.startsWith("DOMAIN")) continue

    // Data line: at least three floats (extra columns are tolerated and
    // ignored, e.g. an alpha column in some exporters' output).
    const parts = line.split(/\s+/).map(Number)
    if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) {
      throw new LutParseError({ message: `Malformed data line: ${line}` })
    }
    values.push(parts[0]!, parts[1]!, parts[2]!)
  }

  if (size === 0) throw new LutParseError({ message: "Missing LUT_3D_SIZE header" })
  const expected = size * size * size
  if (values.length !== expected * 3) {
    throw new LutParseError({
      message: `Expected ${expected} data points for a ${size}³ cube, got ${values.length / 3}`,
    })
  }

  return { size, data: new Float32Array(values) }
}
