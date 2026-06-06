import { Skia } from "@shopify/react-native-skia";

// Rec.709 luma, then interpolate between grey and the source by (1 + amount).
// amount=0 is identity; +1 doubles chroma, -1 zeroes it.
const source = `
uniform shader image;
uniform float amount;

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  half l = dot(c.rgb, half3(0.2126, 0.7152, 0.0722));
  half3 saturated = mix(half3(l), c.rgb, 1.0 + amount);
  return half4(saturated, c.a);
}
`;

export const saturationEffect = Skia.RuntimeEffect.Make(source)!;
