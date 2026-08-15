# Color Mixer: Lightroom-style per-range HSL adjustment layer

A new adjustment layer, **Color Mixer**, that shifts hue, saturation, and
luminance per color range — Lightroom's HSL/Color Mixer panel, which is the
canonical implementation of this interaction. Research summary (the source
material for every decision below): Adobe does not publish the Color Mixer's
range math; the best-documented implementation of the same UI is **GIMP's
hue-saturation operation** (GEGL `gimpoperationhuesaturation.c`, "HSLA float
in sRGB space"), and Snapseed's "Selective" tool is a *different* feature
(spatially anchored control points with attribute-similarity masks, Nik
U-Point patent family) that this app does not need — color-based, not
region-based, selection is the ask. Research sources are listed at the end.

**Status**: implemented (2026-08-15).

## Decisions

### D1 — One layer with 24 normalized fields: 8 ranges × 3 channels

The layer carries `{color}{Channel}` fields for the 8 Lightroom range names —
`redHue`, `redSaturation`, `redLuminance`, `orangeHue`, …, `magentaLuminance`
— 24 numeric fields, each `[-1, 1]`, default 0. This is exactly the existing
registry's per-field uniform packing (one f32 slot per field), so the layer
needs zero new engine machinery: `createLayer` defaults it, `packUniforms`
fills it, and the assembler emits one pass with 24 uniform slots. The range
centers are the standard hue-wheel positions — red 0°, orange 30°, yellow
60°, green 120°, aqua 180°, blue 240°, purple 270°, magenta 300° — with
range boundaries at the midpoints between adjacent centers (red crosses the
0/360 seam: [330°, 15°]).

### D2 — GIMP's HSLA math, delta-blended in one conversion

The pixel math follows GIMP's hue-saturation operation, the reference
implementation of this exact UI:

- **Space**: HSL is computed on sRGB-encoded values, not linear light. Hue
  classification in linear light drifts from what the display shows (the
  ratios between channels change under the transfer curve), and GIMP's
  explicit "HSLA float in sRGB" is the proven choice. The body round-trips
  the linear-light pixel through sRGB with its own self-contained curve
  helpers, prefixed `mixer*` — the pass template only embeds
  `srgbToLinear`/`linearToSrgb` at chain ends, so a middle-of-chain mixer
  must not depend on them (and duplicate names would fail to compile).
- **Weights**: each pixel belongs to one or two adjacent ranges. Weight is 1
  between a range's midpoint boundaries, with a linear crossfade to the
  neighbor over a 10° band past each boundary. Adjacent ranges' weights sum
  to exactly 1 everywhere (a partition of unity — the GIMP overlap scheme
  extended from 6 sectors to 8), so slider movements never double-apply at
  range edges. The wrap-crossing red range unwraps h into its own frame.
- **Adjustments** are applied to the blended deltas in one HSL→RGB
  conversion (GIMP converts per range and blends the results; for the small
  deltas around identity the two are visually equivalent, and one conversion
  halves the ALU):
  - **Hue** — additive with wrap; slider ±1 → ±90° of rotation (GIMP's
    full-deflection mapping).
  - **Saturation** — multiplicative: `S' = S·(1 + v)`, clamped; full left
    desaturates, full right doubles.
  - **Luminance** — asymmetric (GIMP's formula): negative compresses toward
    black (`L·(1+v)`), positive lifts toward white (`L + v·(1−L)`).
- **Achromatic guard**: pixels with HSL saturation ≤ 0.001 are left
  untouched. Hue is undefined for neutrals, so no range can claim them —
  without the guard, near-gray noise would get arbitrary (and visible)
  range assignments, and gray pixels would be wrongly affected by, say, the
  red luminance slider.

### D3 — UI: 8 swatches + the active range's three sliders

The drawer renders the mixer specially (a branch in `layerSliders`, never
the generic 24-slider list): a row of 8 pure-hue swatch dots at the same
centers the shader classifies with, then HUE / SATURATION / LUMINANCE
sliders for the active range. Tapping a swatch dispatches a new
presentation-only message (`SelectedMixerColor`) that sets the per-layer
active range in the model (`activeMixerColor`, keyed by layer id exactly
like the toggled layers' `activeFieldIndex`) — no render, like
`CycledToggledField`. The selection survives confirm (same layer id) and is
cleaned up on cancel/remove/clear exactly where `activeFieldIndex` is. The
drawer summary shows the active range's name plus its non-default values
(e.g. "Blue -100%"); a pristine layer reads just "Red".

This matches Lightroom's cloud/mobile "color dots" pattern and the research
finding that the interaction is *choose a color, then drag* — the targeted
adjustment tool (drag on the image to pick the color under the cursor) is a
separate tool mode that would conflict with the canvas's pan/zoom drag; it
is deliberately out of scope and noted as future work.

## Consequences

- The palette grows to twelve adjustment layers; the card sits after
  Saturation in the picker ("Adjusts hue, saturation, and brightness of one
  color range at a time" / "Recolor a single tone — sky, skin, grass — and
  leave the rest.").
- The mixer pass costs two `pow` calls per pixel (the sRGB round-trip) plus
  the HSL conversion — comparable to white balance, acceptable for a
  compute pass.
- Values outside [0, 1] are clamped before the sRGB round-trip (the same
  clamp the display encode path applies; `pow` of negatives would produce
  NaN in WGSL).
- Exact Adobe parity is not achievable from public data; the midpoint-
  boundary + 10° crossfade scheme is the documented approximation, locked by
  a GPU validation harness and scene tests.
- The WGSL body was validated end-to-end on a real WebGPU device against an
  independent JS port of the same math (10 scenarios × 13 pixels, plus
  hand-computed invariants: +45° rotation of pure red to `(255, 191, 0)`,
  full desaturation to mid gray, luminance ±1 to white/black, gray/white
  untouched, far ranges untouched) and by driving the live app (swatch
  select, slider drags re-rendering the GPU pipeline, committed-layer
  summary).

## Research sources

- Adobe helpx, Color Mixer / image tone color / adjust color (web) — the
  panel's UI and the 8 ranges × 3 channels.
- Lightroom Queen — Color Mixer rename and TAT behavior; "HSL/Color selects
  a wide hue range regardless of its saturation or luminance".
- GIMP source — `gimpoperationhuesaturation.c` and
  `gimphuesaturationconfig.c` (the reference math: HSLA in sRGB, sector
  membership, overlap crossfades, additive hue, multiplicative saturation,
  asymmetric lightness, achromatic guard).
- Nik U-Point patents (US6728421B2 family, US20100027908A1) — Snapseed
  Selective's math; confirmed orthogonal (spatial + attribute similarity),
  not adopted.
- photo.SE 100632, Adobe Community 11352257 — Adobe's 6-color mixer pattern
  and the observation that Lightroom's ranges are uneven and overlapping.
