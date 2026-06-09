import { type BodyRenderer } from "../format";

// Radial vignette. amount = 0 is identity; positive darkens edges,
// negative brightens them. Coord is in pixel space (canvas coords), so
// we normalize via u_resolution before computing radial distance.
// uv maps [0,1] → [-1,1]; aspect ratio is preserved so the vignette
// stays circular even on non-square canvases.
export const renderVignette: BodyRenderer = (i) => `
// vignette
{
  vec2 uv = coord / u_resolution * 2.0 - 1.0;
  half dist = half(length(uv));
  half v = smoothstep(half(l${i}_size) * half(0.6), half(l${i}_size), dist);
  half k = half(1.0) - v * half(l${i}_amount);
  color *= half(k);
}
`;
