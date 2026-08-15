# Mobile support UI

Status: **implemented** (2026).

The app is desktop-first: the editor is a three-column layout (tool panel
288px, canvas, layer drawer 288px) that cannot fit a phone screen, and the
canvas is mouse-centric (wheel zoom, hover LUT previews). This plan makes the
whole app usable on phones and tablets without forking the views.

## Decisions

### D1 — One view, responsive classes; no viewport state in the model

The views keep rendering one tree; Tailwind `lg:` / `sm:` / `md:` classes
switch the layout. The scene tests (jsdom, no CSS) keep finding every
element, and there is no viewport detection or media-query listener in the
model. The only new model state is the mobile sheet toggle (`mobileSheet`),
which is inert on desktop — the panels render side-by-side there regardless
of its value (their classes are `lg:`-scoped).

### D2 — Editor: canvas-first column, panels become bottom sheets

Below `lg` (1024px — covers phones and portrait tablets, where the 288px
side columns would leave a sliver of canvas), the editor stacks:

- **Canvas first** (`order-1`), full width.
- **Tool panel and layer drawer** collapse into full-width bottom sheets
  (max-height 45dvh, scrollable), toggled by a **mobile tab bar**
  (`lg:hidden`): Adjustments / Layers. Tapping the active tab closes the
  sheet. The sheets are in-flow (no fixed positioning), so they coexist
  with the LUT bar without z-index or measurement fragility.
- **A LUT tab** appears on the tab bar while a LUT target exists (the same
  gate as the LUT bar) and toggles the bar — the filmstrip gets a
  first-class affordance on phones; the drawer chevron stays as backup.
- **Auto-follow**: picking a tool flips the sheet to Layers (the draft
  sliders are the working surface — a pick is an edit action, not a
  browsing action); selecting a layer row does the same. A new image
  (pick, EditLoaded, ClearedImage) closes the sheets — the canvas is the
  first thing on screen.
- **Top bar**: the wordmark and Save stay; Save as and New collapse to
  icon-only buttons below `sm` (640px); the save-status line hides below
  `sm`. Every icon-only button keeps its aria-label.
- **LUT bar** stacks below `lg`: tabs become a horizontal scroll row on
  top, the filmstrip below; the fixed 231px desktop height becomes
  `min(340px, 40dvh)` so a landscape phone keeps some canvas.
- **Compare control** goes icon-only below `sm` (the four labeled segments
  overflow ~360px); the **histogram** shrinks 220→140px wide so it does
  not collide with the Compare control.

### D3 — Touch gestures on the canvas

The PanZoom mount (pointer events) already pans with a finger, but zoom was
wheel-only. Added to the mount:

- **Pinch zoom**: two pointers scale about their live midpoint (the
  content under the pinch-start midpoint stays under the fingers); lifting
  one finger hands the pan back to the remaining one without a jump.
- **Double-tap / double-click**: toggles between the fit and 2×, centered
  on the stage (browsers don't fire `dblclick` for touch reliably, so the
  tap is detected manually: two touch downs, 300ms, within 30px).
- **`touch-none`** on the stage: the browser must not hijack the gesture
  into scroll/zoom.
- Sliders get a bigger thumb (24px) and hit area (36px) on coarse pointers
  via `@media (pointer: coarse)` — the 16px desktop thumb is fine under a
  cursor, too small for a finger.

### D4 — Chrome-safe shell

- `#root` height tracks `100dvh` (fallback `100%`): the collapsing mobile
  URL bar would otherwise leave the canvas cut off.
- `viewport-fit=cover` + safe-area padding on the tab bar
  (`pb-[env(safe-area-inset-bottom)]`) for notched phones.
- The export dialog is `w-[min(420px,calc(100vw-2rem))]` with a
  `max-h-[85dvh]` internal scroll — the fixed 420px panel overflows a
  360px viewport.
- The root's offline card and toast span the viewport width below `md`.

### D5 — Gallery

The grid already reflows (`auto-fill, minmax(160px, 1fr)` → two columns on
a phone). The per-tile delete button gets a 28px hit target (was a 10px
text glyph) for touch.

## Out of scope

- Hover-only interactions (LUT bar hover preview) stay mouse-only; taps
  commit directly — the existing desktop behavior, unchanged.
- The `@media (pointer: coarse)` bump only grows the slider thumb; the
  drawer/top-bar buttons keep their existing sizes (≥24px, adequate for
  touch).
