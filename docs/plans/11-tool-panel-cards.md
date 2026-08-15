# Informative tool panel cards

Status: **decided — ready to implement** (grilling session).

The left "Adjustments" panel (`editor/tool-panel.ts`) is a bare list: one row
per tool, icon + label, nothing else. A first-time user cannot tell what an
adjustment does or when to reach for it. This plan turns the rows into
always-visible cards: title, a plain-language "what it does" line, a "when to
use it" line, and a quiet "already in your edit" badge.

Audience assumption (agreed): the app should be usable by someone with no
editing experience. The app's philosophy (CONTEXT.md) — a deliberately small
palette that gently pushes away from runaway editing — makes the *selection
moment* the only moment a novice needs guidance, which is exactly where the
panel sits.

## Decisions

### D1 — Teach-first, minimal monitor (no right-drawer changes)

The cards' primary job is *understand before you add*: two lines of copy per
tool. The only state awareness on the left is a badge when the tool is already
in the chain — the right "Layers" drawer stays the monitor (values, sliders,
visibility). Rejected: mirroring values/selection on the left (duplicates the
drawer, adds cross-panel coupling).

### D2 — Copy shape: what + when, plain language, hand-authored from the shaders

Each card carries two short lines: what the tool *does* (physical) and when to
*use* it (intent). No parameter values on the left — the drawer owns those.
The copy is written from the actual shader bodies in
`engine/src/shaders/bodies/`, because several tools' purpose in this app is
the opposite of generic photo-editing semantics: Chromatic Aberration is an
*aesthetic* film effect (radial R-out/B-in split, zero at center, strongest at
the corners), not a lens correction; White Balance is a creative cast shift;
Grain is added texture, not noise removal. Voice: warm, film-enthusiast, zero
jargon, never "filter"/"preset".

Final copy (signed off in the grilling session):

| Tool | What it does | When to use it |
|------|--------------|----------------|
| LUT | Applies the look of a classic film stock. | Give your photo instant analog character. |
| Exposure | Brightens or darkens the whole photo. | Fix a photo that's too dark or too bright. |
| Contrast | Deepens shadows and lifts highlights. | Make a flat photo punchier, or soften it. |
| Shadows | Lightens or darkens the darkest areas. | Pull detail out of underexposed shadows. |
| Highlights | Lightens or darkens the brightest areas. | Recover blown-out skies and bright spots. |
| White Balance | Shifts the color cast: warm or cool, green or magenta. | Use it to fix an odd cast or set a mood. |
| Saturation | Controls how vivid the colors are. | Make colors pop, or pull back for a faded look. |
| Grain | Adds animated film grain for an analog feel. | Give the photo texture, like classic film. |
| Vignette | Darkens or brightens the photo's edges. | Focus the center, or add a vintage frame. |
| Chromatic Aberration | Splits red and blue at the edges, like an old lens. | Add a touch of analog imperfection. |
| Clarity | Adds punch to textures and fine detail. | Make surfaces pop, or go softer and dreamy. |

### D3 — True cards, always visible, `w-72`, bordered rows

Icon + title on one line, description block below, never hidden behind
hover/tooltip (a novice must not have to discover an interaction to get the
help). The panel widens `w-60` → `w-72` (288px); the card list scrolls inside
the fixed header ("Adjustments" stays pinned) — the same pattern as the LUT
bar's tab column. Style stays on-brand: hard corners, `border-b` rows, flat
panels — no floating rounded cards. Description copy is inside the button
(the card's whole surface is the click target); the existing
`aria-label="Add <label> adjustment"` is preserved.

### D4 — "In your edit" badge

A muted `×N` pill (N = number of chain layers of that type, `border-bordered`,
`text-muted`, `aria-label="In your edit: N"`, `data-testid="in-edit-badge"`),
right-aligned on the card's title line, rendered only when N > 0. Derives from
`model.chain` at render time — no new model state. Counts hidden layers too
(they are still in the edit).

### D5 — LUT card absorbs plan 06's caption (loading/failed)

While `model.catalog === null`, the LUT card's description slot shows the
catalog status instead of the copy: "Loading LUTs…" while `catalogError ===
null`, "LUTs unavailable" on failure (`title` = the error message). This needs
plan 06's `catalogError` model field — currently `CatalogFailed` swallows the
error (`[model, [], none]`). The LUT card also moves **first** in
`LAYER_TYPES_ORDER`: it is the app's signature feature (296 film looks) and
the novice's most likely intent ("make my photo look like film"); under the
old order it sat behind 10 cards and was easy to miss. Deliberate deviation
from the mobile reference ordering (parity has been about value mappings, not
UI layout). Frontend-only, one line.

## Rejected (recorded)

- **Per-photo preview thumbnails** on the cards — the strongest possible
  answer to the novice assumption, and the machinery exists (docs/adr/0013),
  but it is a rendering feature (11 extra thumbnails per photo, per-tool hero
  values, invalidation), not a UI pass. Text carries the teaching job now;
  the card layout leaves a natural slot for a thumbnail later.
- **Expandable / hover-reveal descriptions** — hidden info defeats the
  purpose.
- **Grouped list** (FILM vs ADJUST headers) — adds height to an already
  scrolling list; revisit if the palette grows.
- **Full value mirroring on the left** — the drawer's job (see D1).

## Implementation

- `layer-meta.ts`: `LayerUi` gains `description` + `when` (presentation
  metadata — same convention as icon/label/formatters; no engine change);
  `LAYER_TYPES_ORDER` moves `lut` first.
- `tool-panel.ts`: `toolRow` → `toolCard` (title row + description block +
  badge + LUT status slot); `w-72`; nav scrolls.
- `model.ts` + `update.ts`: `catalogError: NullOr(LutLoadError)` (init null,
  set by `CatalogFailed`, cleared by `CatalogLoaded`) — absorbs plan 06 §2.
- Tests: new `tool-panel.test.ts` (scene: cards render copy, badge appears
  only for tools in the chain, LUT loading/failure captions, card click
  starts the draft); `lut-flow.test.ts` gains the `CatalogFailed` /
  `CatalogLoaded` arms.

## Tests

- Tool panel scene tests (`editor/tool-panel.test.ts`): every card renders
  its two copy lines; the badge shows `×2` on a chain with two Exposure
  layers and is absent on tools not in the chain; the LUT card shows
  "Loading LUTs…" (disabled) while the catalog is null and "LUTs
  unavailable" (with the error `title`) after a failure; clicking a card
  starts the draft (drawer shows the draft row).
- `lut-flow.test.ts`: `CatalogFailed` records `catalogError`, `CatalogLoaded`
  clears it.
