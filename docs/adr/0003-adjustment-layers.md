# Adjustment layers

## The layer-addition pattern

Every adjustment layer follows the registry pattern: plain numeric fields (one f32 uniform slot each), schema-defined defaults, uniform packing, one compute pass emitted by the assembler, a tool card in the picker with copy written from the shader body's actual behavior, and property + scene tests locking defaults, clamping, and chain plumbing. A new layer needs zero new engine machinery.

Bodies in mid-chain that need display-space math embed **self-contained, name-prefixed sRGB helpers** (the pass template only provides colorspace conversion at chain ends; duplicate WGSL names wouldn't compile) and clamp values before `pow` (negatives produce NaN in WGSL). Validation pattern: an independent JS port of the shader math compared against real WebGPU output, plus hand-computed invariants.

## Color Mixer

Lightroom-style per-range HSL: 24 fields — 8 ranges (red…magenta) × hue/saturation/luminance, each [-1, 1], default 0. The math follows GIMP's hue-saturation operation, the best-documented implementation of this exact UI:

- HSL is computed on **sRGB-encoded values** — hue classification drifts from the display in linear light.
- Range weights form a partition of unity: weight 1 between midpoint boundaries, linear crossfade over a 10° band to each neighbor; the wrap-crossing red range unwraps hue into its own frame. Slider moves never double-apply at edges.
- One blended HSL→RGB conversion: hue additive (±90° at full deflection), saturation multiplicative, luminance asymmetric (compress toward black / lift toward white).
- **Achromatic guard**: pixels with saturation ≤ 0.001 are untouched — hue is undefined for neutrals, so no range may claim them.
- UI: a row of 8 swatch dots + three sliders for the active range; the active range is presentation-only model state keyed by layer id.

Exact Adobe parity is unachievable from public data; the GIMP scheme is the documented approximation.

## Tone Curve

A draggable piecewise-linear tonal mapping:

- Exactly **5 control points** — black/white anchors + 3 interior, each (x, y) in [0, 1], default identity (diagonal). Fixed count keeps the plain f32 field machinery, trivial hit-testing, and covers the shapes users actually make (S-curves, lifted blacks, roll-off).
- Points stay x-ordered by construction: `moveCurvePoint` clamps x between neighbors (+2% minimum separation) and y into [0, 1]; the shader additionally floors segment denominators and clamps flat outside the anchors so degenerate data can never produce NaN.
- Applied **per channel in sRGB space** — the widget's coordinates are display values, so WYSIWYG holds. Evaluation is exact piecewise-linear and the widget draws the same polyline the shader evaluates: no smoothing dialect between UI and GPU.
- UI: an SVG plot widget (grid, dashed identity diagonal, draggable handles) replaces the slider list; drag is a mount stream emitting point moves — machine edges while drafting, plain data ops on committed layers. The reset button appears only while the curve diverges from identity (see docs/adr/0010-editor-ui).

Per-channel R/G/B curves and arbitrary point counts remain future work.
