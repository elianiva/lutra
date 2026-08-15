# Informative tool panel cards

The left **Adjustments** panel shows each adjustment as an **always-visible card**: icon + label on one line, a plain-language two-line description ("what it does" / "when to use it") below, and a muted ×N badge when the tool is already in the edit chain. The panel widens 240px → 288px, the LUT card leads the picker, and its description slot doubles as the LUT library load status (the caption from the gallery/tool-panel freebie, absorbed; its other half — gallery delete confirm — is docs/adr/0022).

## Why

The panel was a bare list of icon + label — a first-time user could not tell what an adjustment does or when to reach for it. The audience assumption is that the app must be usable by someone with no editing experience, and the product philosophy (a deliberately small palette that gently pushes away from runaway editing, CONTEXT.md) makes the *selection moment* the only moment a novice needs guidance — exactly where the panel sits. The strong alternative — per-photo preview thumbnails on every card — was rejected for now: it is a rendering feature (11 extra thumbnails per photo, per-tool hero values, invalidation), not a UI pass; the text carries the teaching job and the card layout leaves a natural slot for a thumbnail later.

## Decisions

### D1 — Teach-first cards; the only state on the left is the ×N badge

The cards' job is *understand before you add*. The right **layer drawer** stays the monitor (values, sliders, visibility); mirroring that on the left would duplicate it and add cross-panel coupling. The badge (count of committed chain layers of the card's type, derived from `model.chain` at render time — no new model state) answers "have I already added this?" and quietly reinforces the anti-runaway-editing philosophy. A first-time user sees no badge at all.

### D2 — Copy is hand-authored from the shader bodies, not borrowed

Each card carries two short lines: what the tool does (physical) and when to use it (intent). The copy was written from `engine/src/shaders/bodies/` because several tools' purpose in this app is the opposite of generic photo-editing semantics: Chromatic Aberration is an *aesthetic* film effect (radial R-out/B-in split, zero at center, strongest at corners), not a lens correction; White Balance is a creative cast shift; Grain is added texture, not noise removal. Voice: warm, film-enthusiast, zero jargon, never "filter"/"preset". The copy lives in the frontend's `LAYER_UI` metadata (presentation — same convention as icons and formatters); the engine is untouched. The exact lines live in the frontend's `LAYER_UI` and are locked by scene tests.

### D3 — Always-visible text, `w-72`, bordered rows

Descriptions are never hidden behind hover or tooltip — a novice must not have to discover an interaction to get the help. The panel widens `w-60` → `w-72`; the card list scrolls under the pinned "Adjustments" header (the same pattern as the LUT bar's tab column). Style stays on-brand: hard corners, `border-b` rows, flat panels — no floating rounded cards. The card's whole surface is the click target (the draft flow is unchanged) and the `aria-label="Add <label> adjustment"` convention is preserved.

### D4 — The LUT card leads the picker and carries the catalog status

`LAYER_TYPES_ORDER` moves `lut` first (frontend-only, one line): the LUT library is the app's signature feature — the fast path to "make my photo look like film" — and under the old order it sat behind ten cards. This is a deliberate deviation from the mobile reference ordering; cross-platform parity has always been about value mappings, not UI layout. While `model.catalog === null`, the LUT card's description slot shows the status instead of the copy: "Loading LUTs…" while the fetch is in flight, "LUTs unavailable" on failure with the error message as the card's `title` — plan 06's caption absorbed into the card. This required plan 06's `catalogError` model field (previously `CatalogFailed` swallowed the error): the model now records it, `CatalogLoaded` clears it.

## Consequences

- A novice can read what every adjustment does before adding it; the copy is locked by tests, so it cannot drift silently from the shader behavior.
- The canvas loses 48px of width on the left (288px panel vs 240px) — the price of readable copy; the canvas is still the dominant surface.
- The picker scrolls on short viewports (11 cards ≈ 950px); the header stays pinned.
- Plan 06's §2 (LUT tool caption) is fully absorbed here; plan 06 §1 (gallery delete confirm) is unchanged and still pending.
- The badge counts hidden layers too — they are still in the edit, and the count is deliberately naive.
- If per-photo previews ever land, they drop into the description block's existing slot; the message/command/model surface is untouched by this change.
