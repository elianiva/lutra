# Tone Curve: a draggable tonal mapping adjustment layer

A new adjustment layer, **Tone Curve**, that remaps the image's tones with a
draggable curve — the curves tool of every photo editor (Photoshop, Capture
One, Snapseed, the mobile reference). The user asked for "a tone curve where
you can adjust the curve, like S-curve and all that": the interaction is the
point: drag the curve, see the image regrade live. Unlike the existing tonal
layers (exposure, contrast, shadows, highlights — each one anchored shape),
the curve is free-form.

**Status**: implemented (2026-08-16).

## Decisions

### D1 — A fixed 5-point curve: 2 anchors + 3 interior points

The layer carries exactly 5 control points — the black anchor (0, 0), the
white anchor (1, 1), and three interior points — each with an x (input tone)
and y (output tone) in [0, 1]. A fixed count keeps the layer on the existing
per-field f32 uniform machinery (one uniform slot per field, zero new engine
plumbing), keeps the widget's hit-testing trivial, and covers the shapes
users actually make: S-curves, lifted/faded blacks, highlight roll-off,
midtone gamma bends. The default is the identity curve (points on the
diagonal at x = 0, 0.25, 0.5, 0.75, 1) — a no-op layer.

Arbitrary point counts (Photoshop-style click-to-add) are **future work**:
they need array uniforms with a count, curve re-fitting when points cross,
and hit-testing against segments, not handles. Not worth it for v1.

### D2 — Points are x-ordered by construction; the widget clamps, the shader guards

The curve must stay a function: x strictly increases across points. The
engine's `moveCurvePoint` enforces this at the only mutation point — a drag
clamps the point's x between its neighbors' x's (plus a 2% minimum
separation so handles can't stack and become ungrabbable) and y into [0, 1].
The shader is still defensive: segment denominators are floored (`max(dx,
1e-5)`) so a hand-edited save with degenerate x's can never produce NaN, and
inputs below the first / above the last point clamp flat to that point's
output (the anchors are draggable in both axes, so a lifted black point also
flattens everything below its x).

### D3 — The curve applies per channel in sRGB space, WYSIWYG with the widget

The body round-trips the linear-light pixel through sRGB (self-contained
`curve*` helpers, the Color Mixer's pattern — the pass template only embeds
the colorspace helpers at chain ends) and maps each channel through the same
piecewise-linear curve. Rationale:

- The widget's coordinates are display values: a handle at (0.5, 0.7) means
  "mid-gray maps to 70% gray" exactly as the user sees it. Applying the
  curve in linear light would make the UI lie (linear 0.5 is sRGB ≈ 0.735),
  and every mainstream curves tool grades in gamma-encoded space.
- Per-channel application (not luma) is the standard master-curve behavior
  and the simplest correct thing; the curve's per-channel nonlinearity
  shifts saturation slightly, which is part of the look.

Evaluation is exact piecewise-linear between points, and the widget draws
the same polyline the shader evaluates — what you drag is what you get, no
smoothing dialect between UI and GPU (a smooth interpolation would require
matching implementations in WGSL and the widget; linear is exact and
predictable, like Photoshop's few-point curves).

### D4 — UI: an SVG curve widget in the drawer, replacing the slider list

The drawer renders the Tone Curve layer as a plot (never the generic
10-slider list — point coordinates are meaningless as rulers): a grid at
25/50/75%, a dashed identity diagonal as the neutral reference, the accent
polyline through the points, and one draggable handle per point. A reset
button appears next to the label only while the curve diverges from the
diagonal (the docs/adr/0019 convention: the button's conditional presence is
the off-default signal and the discoverability). A one-line hint ("Drag the
points to shape the curve.") teaches the interaction.

The drag is a `Mount.defineStream` on the svg (the CompareDivider pattern):
the mount owns only hit-testing (handle positions read from the rendered
DOM, threshold 24px) and the drag session (pointer capture, unit-space
conversion), and emits `CurvePointDragged { index, x, y }`; the engine's
`moveCurvePoint` clamps and the phase machine (draft) or `update` (chain
layer) applies it. Touch works via `touch-action: none` on the svg, and the
handle is grabbed-and-jumped on pointerdown (the point follows the pointer
from the grab, like dragging an already-selected handle).

Draft drags go through the machine's new `Drafting` edges (CurvePointDragged
and CurveReset — the machine owns every draft mutation); chain-layer drags
are plain data ops, exactly like `UpdatedLayerParam`.

## Consequences

- The palette grows to thirteen adjustment layers; the card sits after
  Highlights in the picker ("Shapes brightness across the whole range with a
  draggable curve." / "Bend the tones — an S-curve, lifted blacks, or a
  custom grade."), with the `Activity` icon.
- Ten numeric fields per layer (`p0x`..`p4y`), all [0, 1], default identity
  — the registry's plain uniform packing, so the render pipeline needed zero
  changes. The drawer summary is "Neutral" / "Custom".
- The pass costs one sRGB round-trip (two `pow` per channel) plus the
  piecewise-linear evaluation — comparable to the Color Mixer, acceptable
  for a compute pass.
- Values outside [0, 1] are clamped before the sRGB round-trip, like the
  Color Mixer (the same clamp the display encode path applies); a curve
  layer after an overexposing exposure still sees clamped input.
- Fixed 5-point curves cover the common shapes; per-channel R/G/B curves
  (channel tabs) and arbitrary point counts remain future work.
- Locked by: engine property tests (defaults, x-ordering/clamping under
  arbitrary drag paths, reset, neutral detection), body renderer tests
  (namespacing, self-contained colorspace), scene tests (tool card copy,
  widget render, drag → point move → reset affordance, reset → diagonal,
  summary), and the full chain/render request suites (the new type rides
  `LAYER_TYPES` through both property suites).

## Research sources

- Photoshop curves (point drag, dblclick-reset, per-channel tabs) — the
  interaction model; endpoint dragging and flat extension outside the
  anchors.
- Lightroom tone curve — fixed handles, reset affordance; Lightroom
  smooths, we interpolate linearly (D3).
- Snapseed curve — drag-to-adjust on a unit grid with a diagonal reference;
  the same grid + diagonal the widget draws.
- docs/adr/0027 (Color Mixer) — the sRGB round-trip pattern for
  middle-of-chain bodies, and the established layer-addition checklist.
