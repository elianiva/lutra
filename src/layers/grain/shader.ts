import { Skia } from "@shopify/react-native-skia";

// Simple grain overlay using pseudo-random noise.
// amount = 0 is identity; 1 = full grain.
const source = `
uniform shader image;
uniform float amount;

// Hash-based noise (no texture needed).
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  float noise = rand(coord * 0.01) * 2.0 - 1.0;
  float grain = noise * amount * 0.15;
  return half4(clamp(c.rgb + half3(grain), 0.0, 1.0), c.a);
}
`;

export const grainEffect = Skia.RuntimeEffect.Make(source)!;
