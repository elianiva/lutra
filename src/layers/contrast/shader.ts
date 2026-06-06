import { Skia } from "@shopify/react-native-skia";

// S-curve around 0.5. amount=0 is identity; positive = more contrast.
const source = `
uniform shader image;
uniform float amount;

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  half3 rgb = c.rgb;
  half3 contrasted = (rgb - 0.5) * (1.0 + amount) + 0.5;
  return half4(clamp(contrasted, 0.0, 1.0), c.a);
}
`;

export const contrastEffect = Skia.RuntimeEffect.Make(source)!;
