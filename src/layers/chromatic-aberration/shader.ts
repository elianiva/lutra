import { Skia } from "@shopify/react-native-skia";

// Splits R/G/B channels radially from center.
// amount = 0 is identity; positive pushes channels apart.
const source = `
uniform shader image;
uniform float amount;

half4 main(vec2 coord) {
  vec2 center = vec2(0.5);
  vec2 dir = coord - center;
  float dist = length(dir);
  float offset = dist * amount * 0.01;

  float r = image.eval(coord + dir * offset).r;
  float g = image.eval(coord).g;
  float b = image.eval(coord - dir * offset).b;
  float a = image.eval(coord).a;

  return half4(r, g, b, a);
}
`;

export const chromaticAberrationEffect = Skia.RuntimeEffect.Make(source)!;
