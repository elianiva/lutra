import { type BodyRenderer } from "../format";

// Shadow lift only. The mask is 1 at black and falls to 0 by mid-grey.
// The 0.15 multiplier is tuned for the -1..+1 slider range: at full
// slider the shadow lift adds 0.15 (subtle, won't blow blacks into grey).
export const renderShadows: BodyRenderer = (i) => `
// shadows
{
  half luma = clamp(dot(color, half3(0.2126, 0.7152, 0.0722)), half(0.0), half(1.0));
  half mask = half(1.0) - smoothstep(half(0.0), half(0.5), luma);
  color += half3(half(l${i}_amount) * half(0.15)) * mask;
}
`;
