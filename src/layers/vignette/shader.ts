import { Skia } from "@shopify/react-native-skia";

// Radial vignette darkening/brightening from edges.
// amount > 0 darkens edges, < 0 brightens them. 0 = identity.
const source = `
uniform shader image;
uniform float amount;
uniform float size;

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  vec2 uv = coord * 2.0 - 1.0;
  float dist = length(uv);
  float vignette = smoothstep(size, size - 0.8, dist);
  float darkening = 1.0 - vignette * amount;
  return half4(c.rgb * half(darkening), c.a);
}
`;

export const vignetteEffect = Skia.RuntimeEffect.Make(source)!;
