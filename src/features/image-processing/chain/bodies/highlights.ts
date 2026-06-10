import { type BodyRenderer } from "../format";

// Highlight lift only. The mask rises from 0 at mid-grey to 1 at white
// (smoothed with pow 2.2 to soften the shoulder). The 0.2 multiplier
// is tuned for the -1..+1 slider range: at full slider the highlight
// push pulls 0.2 (enough to recover clipped highlights).
export const renderHighlights: BodyRenderer = (i) => `
// highlights
{
  half luma = clamp(dot(color, half3(0.2126, 0.7152, 0.0722)), half(0.0), half(1.0));
  half mask = pow(luma, half(2.2));
  color += half3(half(l${i}_amount) * half(0.2)) * mask;
}
`;
