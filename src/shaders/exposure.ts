// Multiplicative exposure in stops. `gain = 2^stops`.
// stops = 0  -> identity
// stops = +1 -> 2x brighter
// stops = -1 -> 0.5x
export const EXPOSURE_SHADER = `
uniform shader image;
uniform float stops;

half4 main(vec2 coord) {
  half4 c = image.eval(coord);
  float gain = exp2(stops);
  return half4(c.rgb * half(gain), c.a);
}
`;
