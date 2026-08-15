# Mobile support: one responsive view, bottom sheets, touch gestures

Make the whole app usable on phones and tablets without forking the views.
The editor was desktop-first (three fixed columns, mouse-centric canvas); a
phone could not fit it.

**Status**: implemented (2026-08-15).

## Decisions

### D1 — One view, responsive classes; no viewport state in the model

The views keep rendering one tree; Tailwind `lg:`/`sm:`/`md:` classes switch
the layout, so the scene tests (jsdom, no CSS) keep finding every element.
No viewport detection or media-query listener in the model. The only new
model state is the mobile sheet toggle (`mobileSheet`), inert on desktop.

### D2 — Editor: canvas-first column, panels become bottom sheets

Below `lg` (1024px — phones and portrait tablets):

- **Canvas first** (`order-1`), full width.
- **Tool panel and layer drawer** collapse into full-width bottom sheets
  (max-height 45dvh, scrollable), toggled by a **mobile tab bar**
  (`lg:hidden`): Adjustments / Layers. Tapping the active tab closes the
  sheet. Sheets are in-flow (no fixed positioning), so they coexist with the
  LUT bar without z-index or measurement fragility.
- **A LUT tab** appears on the tab bar while a LUT target exists (same gate
  as the LUT bar) and toggles the bar.
- **Auto-follow**: picking a tool flips the sheet to Layers (the draft
  sliders are the working surface); selecting a layer row does the same. A
  new image closes the sheets.
- **Top bar**: wordmark + Save stay; Save as / New collapse to icon-only
  buttons below `sm` (640px); save-status line hides below `sm`. Every
  icon-only button keeps its aria-label.
- **LUT bar** stacks below `lg` (tabs row on top, filmstrip below); height
  becomes `min(340px, 40dvh)`.
- **Compare control** icon-only below `sm`; the **histogram** shrinks 220 →
  140px wide so it doesn't collide.

### D3 — Touch gestures on the canvas

- **Pinch zoom**: two pointers scale about their live midpoint; lifting one
  finger hands pan back to the remaining one without a jump.
- **Double-tap / double-click**: toggles fit ↔ 2×, centered on the stage
  (detected manually: two touch downs, 300ms, within 30px — browsers don't
  fire `dblclick` reliably for touch).
- **`touch-none`** on the stage — the browser must not hijack gestures into
  scroll/zoom.
- Sliders get a bigger thumb (24px) and hit area (36px) on coarse pointers
  via `@media (pointer: coarse)`.

### D4 — Chrome-safe shell

- `#root` height tracks `100dvh` (fallback `100%`) — the collapsing mobile
  URL bar would otherwise cut the canvas off.
- `viewport-fit=cover` + safe-area padding on the tab bar
  (`pb-[env(safe-area-inset-bottom)]`) for notched phones.
- The export dialog is `w-[min(420px,calc(100vw-2rem))]` with a
  `max-h-[85dvh]` internal scroll.
- The root's offline card and toast span the viewport width below `md`.

### D5 — Gallery

The grid already reflows (`auto-fill, minmax(160px, 1fr)` → two columns on a
phone). The per-tile delete button gets a 28px hit target (was a 10px text
glyph) for touch.

## Out of scope

- Hover-only interactions (LUT bar hover preview) stay mouse-only; taps
  commit directly.
- The `@media (pointer: coarse)` bump only grows the slider thumb; other
  buttons keep their existing sizes (≥24px, adequate for touch).
