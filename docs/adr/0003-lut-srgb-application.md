# LUT layers apply color cubes in sRGB-encoded space

The chain pipeline runs in linear light, but the vendored G'MIC film LUTs (`.cube` files from the Film-Luts mirror) are authored against sRGB-encoded values — G'MIC's working space is sRGB, and the LUTs' lift/toe behavior only reads correctly there. A LUT pass therefore round-trips through sRGB: its linear input is decoded to sRGB before lookup, strength mixes in sRGB space, and the result is re-encoded to linear for the rest of the chain. The round-trip is skipped at the chain ends — the source texture and the display texture are already sRGB, so a LUT pass that reads the source or writes the display applies the cube directly. The cube lives in a 13³ 3D texture (rgba32float) read with manual trilinear interpolation (textureLoad, §4 of the architecture notes).

**Status**: accepted

**Considered Options**:

- **Apply the LUT in linear light** — the simpler pass, no color-space conversion, but the film curves are keyed to the sRGB toe; linear-space application visibly changes the look of every preset (lifted blacks wash out further, the S-curves land differently). Rejected because the whole point of the feature is faithful film emulation.
- **Tetrahedral interpolation in the shader** — higher-quality interpolation for small cubes, but the trilinear path is standard for hald/3D-LUT application, is free, and banding is not observable at 13³ with film-grade smooth curves. Deferred.

**Consequences**:

- The assembler has a second pass kind whose color-space boundaries invert the usual linearize/encode flags (decode instead of linearize at input, encode at output only when the pass is not last).
- LUT bodies are the one place the "bodies always see linear light" invariant is relaxed: by contract, a LUT body sees sRGB-encoded values.
- Body renderers now declare their resource needs structurally (`samplesInput`, `needsLut`) instead of relying on WGSL string inspection, which the LUT body's `textureSampleLevel` would have tripped.
