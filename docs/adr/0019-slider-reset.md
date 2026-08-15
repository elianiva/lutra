# Slider reset button + center-zero marker

Three improvements to `sliderControl` (`editor/layer-drawer.ts`), shared by
draft and committed sliders: reset-to-default in one gesture, a marker showing
where 0 sits on bipolar sliders, and (optional) a filled track.

**Status**: decided (2026-08-07 planning session); not yet implemented.

## Decisions

### D1 — Reset button; no double-click

A small `RotateCcw` (lucide) button next to the value, rendered **only when
`value !== default`** (compare against the registry default exactly — slider
values are set in 0.01 steps from the same domain, no `≈` fuzz). Clicking
dispatches `UpdatedLayerParam` / `UpdatedDraftParam` with the default value.
The registry already carries `default` per field; `fieldDefault(type, field)`
sits next to `fieldBounds` in `layer-meta.ts`.

Double-click-to-reset was **rejected**: foldkit has no `OnDblClick` builder
helper — it would need a small `Mount.defineStream` (the `CompareDivider`
pattern). Deferred; it can land later without touching the button. The
button's conditional appearance _is_ the discoverability: it doubles as the
visible "off-default" affordance.

### D2 — Center-zero marker on bipolar fields only

A 1px vertical line at the track's 50%, drawn _behind_ the input (wrapped in
a `relative` div, `pointer-events-none`, `--color-border`) — rendered only
when `min < 0 < max`: exposure, contrast, shadows, highlights, white balance
(temp + tint), saturation, vignette amount, chromatic aberration, clarity.

**Nothing** on non-crossing fields (grain, vignette size, LUT strength):
their no-effect value sits at a track edge the track already draws, and a
second marker meaning (e.g. default-position ticks) would create two dialects
of one visual language. The reset button answers "where's default?" on demand.

### D3 — Filled track: optional, deferred

Value-relative fill via a CSS gradient on the track (pure CSS, `h.Style` per
input; bipolar: 50% at 0). Not part of this pass.

## Consequences

- One gesture returns any field to default; the button's presence signals
  divergence from default at a glance.
- Tests: `fieldDefault` matches `createLayer` defaults; reset sends the
  default through the param messages; button absent when already default.
