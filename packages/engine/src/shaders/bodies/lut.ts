import type { BodyRenderer } from '../types'

// Film-emulation LUT application. The pass contract (docs/adr/0001-rendering-engine) is that
// `color` is sRGB-encoded here — the assembler encodes linear light to sRGB
// ahead of a LUT body and decodes after it — so the body only samples and
// mixes.
//
// The cube is an rgba16float 3D texture (the frontend converts the parsed
// f32 data to half floats on upload), so it is filterable and one hardware
// trilinear sample replaces eight loads. Texel centers sit at
// (i + 0.5) / N, so input c in [0, 1] maps to (c·(N−1) + 0.5) / N — the
// same corner texels and weights as the CPU mirror (`applyLutCpu`).
export const renderLut: BodyRenderer = (i) => ({
  needsLut: true,
  stmts: `
{
  let lutSize = f32(textureDimensions(l${i}_lut).x);
  let uvw = (clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)) * (lutSize - 1.0) + 0.5) / lutSize;
  let lutColor = textureSampleLevel(l${i}_lut, samp, uvw, 0.0).rgb;
  color = mix(color, lutColor, l${i}_amount);
}
`,
})
