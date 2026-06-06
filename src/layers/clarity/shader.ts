import { Skia } from "@shopify/react-native-skia";

// Local contrast enhancement (midtone contrast / structure).
// Works by boosting contrast only in the midtones.
// amount = 0 is identity; positive = more clarity.
const source = `
uniform shader image;
uniform float amount;

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  half3 rgb = c.rgb;
  half l = dot(rgb, half3(0.2126, 0.7152, 0.0722));

  // Midtone mask: peaks at 0.5, fades at 0 and 1.
  half mask = 1.0 - 4.0 * (l - 0.5) * (l - 0.5);
  mask = clamp(mask, 0.0, 1.0);

  half3 lifted = rgb + half3(amount) * mask * 0.15;
  return half4(clamp(lifted, 0.0, 1.0), c.a);
}
`;

export const clarityEffect = Skia.RuntimeEffect.Make(source)!;
