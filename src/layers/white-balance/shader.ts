import { Skia } from "@shopify/react-native-skia";

// Temp (Kelvin, normalized to -1..+1) shifts R/B in opposite directions.
// Tint shifts G up and R/B down (or vice versa) for green/magenta axis.
// Both params at 0 = neutral.
const source = `
uniform shader image;
uniform float temp;
uniform float tint;

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  half3 rgb = c.rgb;
  // temp: -1 (warm) boosts R, +1 (cool) boosts B
  half3 wb = half3(1.0 - temp * 0.3, 1.0, 1.0 + temp * 0.3);
  // tint: +1 leans green, -1 leans magenta
  wb.g += tint * 0.2;
  wb.r -= tint * 0.1;
  wb.b -= tint * 0.1;
  rgb *= wb;
  return half4(clamp(rgb, 0.0, 1.0), c.a);
}
`;

export const whiteBalanceEffect = Skia.RuntimeEffect.Make(source)!;
