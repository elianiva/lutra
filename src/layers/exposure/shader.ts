import { Skia } from "@shopify/react-native-skia";

// Multiplicative exposure in stops. gain = 2^stops.
const source = `
uniform shader image;
uniform float stops;

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  float gain = exp2(stops);
  return half4(c.rgb * half(gain), c.a);
}
`;

export const exposureEffect = Skia.RuntimeEffect.Make(source)!;
