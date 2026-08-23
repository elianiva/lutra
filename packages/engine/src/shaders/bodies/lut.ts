import type { BodyRenderer } from '../types'

// Film-emulation LUT application. The pass contract (docs/adr/0003) is that
// `color` is sRGB-encoded here — the pass decodes linear light to sRGB on
// the way in and re-encodes on the way out — so the body only samples and
// mixes.
//
// The cube is a 13³ rgba32float 3D texture. Sampling uses textureLoad +
// manual trilinear interpolation instead of hardware filtering: 32-bit
// float textures are not filterable in WebGPU, and textureLoad also
// sidesteps the f32→f16 conversion bug Chrome has in writeTexture (raw
// f32 bytes land verbatim in f16 textures, corrupting every row). The
// manual math is the same texel-space mapping hardware trilinear would
// use — p = c·(SIZE−1), corner texels at floor(p), lerp by the fraction.
export const renderLut: BodyRenderer = (i) => ({
  needsLut: true,
  stmts: `
{
  let p = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)) * (LUT_SIZE - 1.0);
  let x0 = vec3<i32>(floor(p));
  let f = p - vec3<f32>(x0);
  let maxT = i32(LUT_SIZE) - 1;
  let x1 = min(x0 + vec3<i32>(1), vec3<i32>(maxT));
  let c000 = textureLoad(lutTex, vec3<i32>(x0.x, x0.y, x0.z), 0).rgb;
  let c100 = textureLoad(lutTex, vec3<i32>(x1.x, x0.y, x0.z), 0).rgb;
  let c010 = textureLoad(lutTex, vec3<i32>(x0.x, x1.y, x0.z), 0).rgb;
  let c110 = textureLoad(lutTex, vec3<i32>(x1.x, x1.y, x0.z), 0).rgb;
  let c001 = textureLoad(lutTex, vec3<i32>(x0.x, x0.y, x1.z), 0).rgb;
  let c101 = textureLoad(lutTex, vec3<i32>(x1.x, x0.y, x1.z), 0).rgb;
  let c011 = textureLoad(lutTex, vec3<i32>(x0.x, x1.y, x1.z), 0).rgb;
  let c111 = textureLoad(lutTex, vec3<i32>(x1.x, x1.y, x1.z), 0).rgb;
  let lutColor = mix(
    mix(mix(c000, c100, f.x), mix(c010, c110, f.x), f.y),
    mix(mix(c001, c101, f.x), mix(c011, c111, f.x), f.y),
    f.z
  );
  color = mix(color, lutColor, l${i}_amount);
}
`,
})
