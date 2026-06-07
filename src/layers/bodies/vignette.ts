import { type BodyRenderer } from "../format";

// Radial vignette. amount = 0 is identity; positive darkens edges,
// negative brightens them. The smoothstep args are (low, high, x):
// rises from 0 at dist = size-0.8 to 1 at dist = size, so the darkening
// grows in from the edges. (The old per-layer shader had these swapped,
// producing undefined behavior \u2014 a hard step or no effect.)
//
// Aspect ratio: the radial distance is computed from coord * 2 - 1,
// which is non-uniform on non-square canvases (the vignette becomes
// elliptical). This matches the previous per-layer behavior; the
// aspect-correct fix needs a resolution uniform which is out of scope
// for v1.
export const renderVignette: BodyRenderer = (i) => `
// vignette
{
  vec2 uv = coord * 2.0 - 1.0;
  half dist = half(length(uv));
  half v = smoothstep(half(l${i}_size) - half(0.8), half(l${i}_size), dist);
  half k = half(1.0) - v * half(l${i}_amount);
  color *= half(k);
}
`;
