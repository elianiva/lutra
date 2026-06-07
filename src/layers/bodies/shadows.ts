import { type BodyRenderer } from "../format";

// Shadows / highlights in linear light. The shadow mask is 1 at black
// and falls to 0 by mid-grey; the highlight mask rises from 0 at
// mid-grey to 1 at white (smoothed with pow 2.2 to soften the shoulder).
//
// The 0.15 / 0.2 multipliers are tuned for the -1..+1 slider range: at
// full slider the shadow lift adds 0.15 (subtle, won't blow blacks into
// grey) and the highlight push pulls 0.2 (enough to recover clipped
// highlights). Values can be retuned in-place without touching the
// registry or the slider contract.
export const renderShadows: BodyRenderer = (i) => `
// shadows / highlights
{
  half luma = clamp(dot(color, half3(0.2126, 0.7152, 0.0722)), half(0.0), half(1.0));
  {
    half mask = half(1.0) - smoothstep(half(0.0), half(0.5), luma);
    color += half3(half(l${i}_shadows) * half(0.15)) * mask;
  }
  {
    half mask = pow(luma, half(2.2));
    color += half3(half(l${i}_highlights) * half(0.2)) * mask;
  }
}
`;
