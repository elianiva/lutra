import { type BodyRenderer } from "../format";

// Temp shifts R and B in opposite directions; tint shifts G with a
// smaller R/B pull. Multiplicative in linear light \u2014 the channel
// scaling is the right model for the colored-gel feel of a white
// balance adjustment. temp: -1 cool / +1 warm, tint: -1 magenta / +1
// green, both 0 = neutral.
export const renderWhiteBalance: BodyRenderer = (i) => `
// white balance
{
  half temp = l${i}_temp;
  half tint = l${i}_tint;
  color.r *= half(1.0) - temp * half(0.3);
  color.b *= half(1.0) + temp * half(0.3);
  color.g *= half(1.0) + tint * half(0.2);
  color.r *= half(1.0) - tint * half(0.1);
  color.b *= half(1.0) - tint * half(0.1);
}
`;
