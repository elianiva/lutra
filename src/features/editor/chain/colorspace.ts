// sRGB <-> linear conversion functions, embedded verbatim into every
// generated chain source. The chain source generator prepends these to
// the generated SkSL so every body can call srgbToLinear / linearToSrgb.
//
// Piecewise IEC 61966-2-1 sRGB curve — not the cheaper pow(2.2)
// approximation. The 0.04045 / 0.0031308 break points are the actual
// sRGB standard; pow(2.2) is off by ~1% in the toe and shoulder which
// shows up as a faint cast when the chain is short (e.g. one contrast
// layer on a neutral image).
export const SRGB_TO_LINEAR = `
half3 srgbToLinear(half3 c) {
  return half3(
    c.r <= half(0.04045) ? c.r / half(12.92) : pow((c.r + half(0.055)) / half(1.055), half(2.4)),
    c.g <= half(0.04045) ? c.g / half(12.92) : pow((c.g + half(0.055)) / half(1.055), half(2.4)),
    c.b <= half(0.04045) ? c.b / half(12.92) : pow((c.b + half(0.055)) / half(1.055), half(2.4))
  );
}

half3 linearToSrgb(half3 c) {
  c = clamp(c, half3(0.0), half3(1.0));
  return half3(
    c.r <= half(0.0031308) ? c.r * half(12.92) : half(1.055) * pow(c.r, half(1.0 / 2.4)) - half(0.055),
    c.g <= half(0.0031308) ? c.g * half(12.92) : half(1.055) * pow(c.g, half(1.0 / 2.4)) - half(0.055),
    c.b <= half(0.0031308) ? c.b * half(12.92) : half(1.055) * pow(c.b, half(1.0 / 2.4)) - half(0.055)
  );
}
`;
