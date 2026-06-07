import { type BodyRenderer } from "../format";

// PLACEHOLDER. The current clarity is a uniform midtone lift, not real
// local contrast \u2014 it's effectively a duplicate of shadows. The
// 0.2140 mid-grey anchor and linear-light math are correct now, but the
// body itself is still a midtone lift. Real clarity (multi-tap local
// mean with image.eval) is deferred to a follow-up; the user can add a
// clarity layer to the chain and it will render something reasonable
// until the real implementation lands.
export const renderClarity: BodyRenderer = (i) => `
// clarity (placeholder midtone lift; real local contrast deferred)
{
  half luma = dot(color, half3(0.2126, 0.7152, 0.0722));
  half mask = half(1.0) - half(4.0) * (luma - half(0.5)) * (luma - half(0.5));
  mask = clamp(mask, half(0.0), half(1.0));
  color += half3(half(l${i}_amount) * mask * half(0.15));
}
`;
