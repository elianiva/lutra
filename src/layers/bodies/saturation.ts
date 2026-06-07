import { type BodyRenderer } from "../format";

// Rec.709 luma mix in linear light. amount = 0 is identity; +1 doubles
// chroma, -1 zeroes it. The mix-toward-luma form is the standard
// saturation primitive: it's the same math the Film-Simulator single-
// dispatch shader uses, just inlined per layer in F.
export const renderSaturation: BodyRenderer = (i) => `
// saturation
{
  half luma = dot(color, half3(0.2126, 0.7152, 0.0722));
  color = mix(half3(luma), color, half(1.0 + l${i}_amount));
}
`;
