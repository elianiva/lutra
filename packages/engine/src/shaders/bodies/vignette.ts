import type { BodyRenderer } from '../types'

// Radial vignette. amount = 0 is identity; positive darkens edges,
// negative brightens them. uv maps [0,1] → [-1,1] and the x axis is
// scaled by the aspect ratio (width/height) before the distance is
// computed, so the falloff stays circular on any frame shape.
export const renderVignette: BodyRenderer = (i) => `
{
  var uv = vec2<f32>(f32(coord.x), f32(coord.y)) / u_resolution * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  let dist = length(uv);
  let v = smoothstep(l${i}_size * 0.6, l${i}_size, dist);
  let k = 1.0 - v * l${i}_amount;
  color *= k;
}
`
