import { type BodyRenderer } from "../format";

// Cheap per-pixel grain. Lives at pixel Nyquist so it reads as digital
// noise when scrutinized, but it's a few ALU ops per pixel so it stays
// smooth on the slider drag. The two-quality film-emulation path (FBM
// + per-channel cell sizes + density curve + soft-light blend) is
// deferred to a follow-up.
//
// Density weighting uses linear luma with a triangular midtone falloff
// (peak at 0.5, floor at 0.35) so deep blacks and bright highlights
// stay clean while the noise concentrates where film grain is most
// visible.
export const renderGrain: BodyRenderer = (i) => `
// grain
{
  half3 hp = half3(
    fract(coord.x * half(0.1031)),
    fract(coord.y * half(0.1031)),
    fract(coord.x * half(0.1031))
  );
  hp += dot(hp, hp.yzx + half(33.33));
  half n = fract((hp.x + hp.y) * hp.z);
  half noise = n - half(0.5);
  half L = clamp(dot(color, half3(0.2126, 0.7152, 0.0722)), half(0.0), half(1.0));
  half w = half(1.0) - abs(L - half(0.5)) * half(1.4);
  w = max(w, half(0.35));
  color += noise * half(l${i}_amount) * w;
  color = clamp(color, half3(0.0), half3(1.0));
}
`;
