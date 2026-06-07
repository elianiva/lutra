import { type BodyRenderer } from "../format";

// S-curve around perceptual mid-grey (0.2140 in linear Rec.709), not
// 0.5 in sRGB. The 0.5 anchor crushes shadows and burns highlights;
// 0.2140 is the actual luminance of an sRGB mid-grey and is the
// physically correct center of the perceptual scale.
//
// Clamp the slider to \u00b10.99 so 1.0 - amount can never divide by zero.
// The registry constrains to [-1, 1] inclusive, so the worst case
// "contrast = -1" would otherwise produce infinity.
export const renderContrast: BodyRenderer = (i) => `
// contrast
{
  half amt = clamp(l${i}_amount, half(-0.99), half(0.99));
  half factor = amt > half(0.0)
    ? half(1.0 + amt)
    : half(1.0 / (1.0 - amt));
  color = (color - half(0.2140)) * factor + half(0.2140);
}
`;
