import type { LutCube } from "./cube"

// CPU-side LUT application — the pure-JS mirror of the WGSL LUT pass body
// (shaders/bodies/lut.ts). The bar's per-photo preview thumbnails run
// through this in the thumb worker (docs/adr/0013) instead of the GPU
// pipeline: a LUT-only chain compiles to a single pass with no colorspace
// boundary (sRGB source in, sRGB display out — the round-trip is skipped at
// both ends), so the body is exactly "trilinear-sample the cube, mix by
// strength". This function is that body, translated 1:1.

// The WGSL body's texel-space mapping (identical math, no hardware
// filtering — 32-bit float textures are not filterable, so the shader reads
// texels with textureLoad and lerps by hand):
//
//   p = clamp(color, 0, 1) * (SIZE - 1)
//   x0 = floor(p); f = p - x0
//   x1 = min(x0 + 1, SIZE - 1)
//   lutColor = trilinear mix of the 8 corner texels at f
//   color = mix(color, lutColor, amount)
//
// The input pixels are 8-bit, so clamp is an identity and is omitted; the
// alpha channel passes through untouched (the shader does the same — it
// stores `alpha` unmodified). The output is a fresh ImageData; the caller's
// input is never mutated.
export function applyLutCpu(image: ImageData, cube: LutCube, amount = 1): ImageData {
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data.length)
  const { size, data: cubeData } = cube
  const scale = size - 1
  const max = size - 1

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255
    const g = data[i + 1]! / 255
    const b = data[i + 2]! / 255

    // p = c * (SIZE - 1); x0 = floor(p); f = frac(p)
    const pr = r * scale
    const pg = g * scale
    const pb = b * scale
    const x0r = Math.floor(pr)
    const x0g = Math.floor(pg)
    const x0b = Math.floor(pb)
    const fr = pr - x0r
    const fg = pg - x0g
    const fb = pb - x0b
    // x1 = min(x0 + 1, SIZE - 1) — the top edge clamps into the last texel
    // plane, collapsing the lerp to a single texel exactly like the shader.
    const x1r = x0r + 1 <= max ? x0r + 1 : max
    const x1g = x0g + 1 <= max ? x0g + 1 : max
    const x1b = x0b + 1 <= max ? x0b + 1 : max

    // Cube point order — index (b * size + g) * size + r, RGB triples.
    // The vendored G'MIC cubes vary red fastest (verified against the
    // upstream data: point index 1 is the red-axis step, point size² is the
    // blue-axis step). This matches the GPU texture upload 1:1 — the
    // frontend strides the same file-order data into the 3D texture, whose
    // X/Y/Z axes are the file's fastest/slowest axes — so the CPU sampler
    // and the shader read the same texel for the same color. (parseCube's
    // doc comment once claimed the opposite order; the data says otherwise.)
    const at = (rr: number, gg: number, bb: number) => ((bb * size + gg) * size + rr) * 3
    const c000 = at(x0r, x0g, x0b)
    const c100 = at(x1r, x0g, x0b)
    const c010 = at(x0r, x1g, x0b)
    const c110 = at(x1r, x1g, x0b)
    const c001 = at(x0r, x0g, x1b)
    const c101 = at(x1r, x0g, x1b)
    const c011 = at(x0r, x1g, x1b)
    const c111 = at(x1r, x1g, x1b)

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
      // color = mix(color, lutColor, amount); writing through the clamped
      // array applies the same 8-bit rounding + clamping the GPU's
      // rgba8unorm store does.
      out[i + ch] = mix(data[i + ch]! / 255, lut, amount) * 255
    }
    out[i + 3] = data[i + 3]!
  }

  return new ImageData(out, width, height)
}
