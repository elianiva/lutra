# Slider reset + center-zero marker

Status: **decided** — direction agreed and the two open questions resolved.
Ready to implement.

## Goal

Three improvements to `sliderControl` (`editor/layer-drawer.ts`), shared by
draft and committed sliders:

1. **Reset to default** — one gesture returns a field to its engine default.
2. **Center-zero marker** — a bipolar slider (exposure −3..+3, contrast, …)
   currently reads as an undifferentiated 2px line; you can't see where 0 sits
   or which side of 0 you're on.
3. **(Optional) filled track** — visible fill from the center-zero position to
   the thumb, so the value's magnitude reads at a glance.

## Facts (verified)

- The engine registry owns `default` per field (`layer-meta.ts` `fieldBounds`
  already reads `min`/`max` from `ENGINE_REGISTRY[type].fields[field]`; the
  registry's entry also carries `default` — `fieldBounds` just doesn't expose
  it). Add `fieldDefault(type, field)` next to it (or extend `fieldBounds`).
- The slider is one `h.input` (range) with `lutra-range` styles
  (`styles.css`): 2px track, 16px square red thumb, no fill.
- `layer-meta.ts` `LAYER_UI[type].fields[field].format` already renders the
  value; the label row shows `label` + `display`.
- foldkit has **no `OnDblClick`** builder helper (verified in the html builder
  d.ts) — double-click needs a `Mount.defineStream` (the `CompareDivider`
  pattern in `canvas-stage.ts`), or we skip dblclick entirely.

## Which fields cross zero

Center-zero marker applies only when `min < 0 < max`:

- **Cross zero**: exposure (stops), contrast, shadows, highlights, white
  balance (temp + tint), saturation, vignette amount, chromatic aberration,
  clarity.
- **Don't cross**: grain (texture/size/blur, 0–1), vignette size (0.2–1), LUT
  strength (0–1). No marker; the thumb at track start = minimum.

## Recommended design

### D1 — Reset button (primary), double-click (optional)

- A small `RotateCcw` (lucide) button next to the value, rendered only when
  `value !== default` (per-field compare — avoid `≈` float fuzz by comparing
  against the registry default exactly; slider values are set in 0.01 steps
  from the same domain). Clicking dispatches `UpdatedLayerParam({ id, field,
  value: default })` / `UpdatedDraftParam(...)`.
- Rationale: discoverable, foldkit-native (one `OnClick`), works on both draft
  and committed sliders, and it doubles as the **visible affordance** that a
  field is off-default — valuable on its own.
- Double-click-to-reset: **optional** (Q1). If wanted, a small
  `Mount.defineStream` on the range input's wrapper (dblclick listener, like
  `CompareDivider`'s) emitting the same param message. The button stays either
  way.

### D2 — Center-zero marker

A 1px vertical line at the track's 50% position, drawn *behind* the input:
wrap the input in a `relative` div and absolutely position the marker
(`left-1/2`, `-translate-x-1/2`), `pointer-events-none`, color
`var(--color-border)` (the track is `--color-border-strong`; the marker should
read as a reference line, not a track element). For **non-crossing** fields the
marker is a small left-edge tick instead (or nothing — see Q2).

### D3 — Filled track (optional)

Value-relative fill via a CSS gradient on the track:
`background: linear-gradient(to right, <fill> 0%, <fill> p%, transparent p%)`
where `p` maps the value into the track (bipolar: 50% at 0). The `lutra-range`
CSS already targets `::-webkit-slider-runnable-track` / `::-moz-range-track`;
the gradient would be set inline per-input (`h.Style`). Static image of the
track is cheap; the fill is pure CSS.

## Resolved questions

- **Q1 — double-click included?** → **No.** Button only. foldkit has no
  `OnDblClick` builder helper, so double-click would need a small
  `Mount.defineStream` (the `CompareDivider` pattern) — deferred; it can land
  later without touching the button. The button's appearance *is* the
  discoverability: it renders only when a field is off-default.
- **Q2 — marker on non-crossing fields?** → **None.** The marker's meaning is
  "zero / no-effect", and for non-crossing fields that reference sits at a
  track edge the track already draws (the thumb at the left end *is*
  "nothing applied"). A default-position tick (vignette size defaults to 0.6
  mid-track) would be the rule's only instance in the app — grain defaults
  are 0 (left edge), LUT strength defaults to 1 (right edge) — and a second
  marker meaning would create two dialects of the same visual language in an
  austere design. The reset button answers "where's default?" on demand.

## Tests

- `fieldDefault` helper: registry defaults match `createLayer`'s
  (`defaults.ts` is engine-owned; cross-check a couple of fields).
- Reset dispatch: extend an existing per-slice test file (`save-edit.test.ts`
  pattern) — reset sends the default value through `UpdatedLayerParam` /
  `UpdatedDraftParam`, and the reset button is absent when already default
  (view-level; assert via the `Scene` test helpers if the slice has them, else
  keep to the message-level test).
