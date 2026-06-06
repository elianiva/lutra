import { Skia } from "@shopify/react-native-skia";

// Luminance-weighted lift in dark (shadows) and bright (highlights) regions.
// Both params are in -1..+1; 0 is identity.
const source = `
uniform shader image;
uniform float shadows;
uniform float highlights;

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  half3 rgb = c.rgb;
  half l = dot(rgb, half3(0.2126, 0.7152, 0.0722));
  half shadowMask = 1.0 - smoothstep(0.0, 0.5, l);
  half highlightMask = smoothstep(0.5, 1.0, l);
  rgb += half3(shadows) * shadowMask * 0.3;
  rgb += half3(highlights) * highlightMask * 0.3;
  return half4(clamp(rgb, 0.0, 1.0), c.a);
}
`;

export const shadowsEffect = Skia.RuntimeEffect.Make(source)!;
