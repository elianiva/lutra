import type { BodyRenderer } from "../types"

// Chromatic aberration: samples the source texture at offset positions
// to split R and B channels radially. Uses nearest-neighbor sampling
// (integer coordinate offsets) since compute shaders use textureLoad.
// The amount parameter controls split intensity; 0 = no split.
export const renderChromaticAberration: BodyRenderer = (i) => `
// chromatic aberration
{
  let offset = i32(l${i}_amount * 4.0);
  let rCoord = clamp(vec2<i32>(coord) + vec2<i32>(offset, 0), vec2<i32>(0), vec2<i32>(u_resolution) - 1);
  let bCoord = clamp(vec2<i32>(coord) + vec2<i32>(-offset, 0), vec2<i32>(0), vec2<i32>(u_resolution) - 1);
  let rVal = textureLoad(srcTex, rCoord, 0).r;
  let bVal = textureLoad(srcTex, bCoord, 0).b;
  let strength = abs(l${i}_amount);
  color.r = mix(color.r, rVal, strength);
  color.b = mix(color.b, bVal, strength);
}
`
