# A11y pass

Status: **decided** — scope agreed and both questions resolved. Ready to
implement.

## Goal

Cheap, high-value accessibility fixes. Not a full audit — targeted at what a
keyboard + screen-reader user hits immediately in this UI.

## Findings (verified in code)

1. **No focus-visible styles anywhere.** `styles.css` defines no
   `:focus-visible` rule and the views attach no focus classes (Tailwind v4
   preflight does not add focus rings). Keyboard users literally cannot see
   where focus is. This is the top a11y item.
2. **Red-on-dark contrast.** The wordmark, "Save failed", and error text use
   `--color-accent` (#cc0000) on `--color-bg` (#111) / panels. Computed
   contrast ≈ **3.2:1** — below WCAG AA's 4.5:1 for normal text. White on
   #cc0000 (the Save button, filled segments) ≈ **5.9:1 — passes**. So the
   *fill* red is fine; the *text* red is not.
3. **Nested interactive elements in the gallery tile.** `gallery/view.ts`
   `tile` is an `h.button` whose child is the delete ✕ `h.button` — invalid
   HTML (interactive inside interactive), breaks screen-reader semantics and
   can misfire on some browsers. Must be restructured.
4. **No favicon.** `index.html` has no `<link rel="icon">` — the tab shows a
   blank page icon. Cosmetic but noticed on day one.

## Recommended design

### D1 — Global focus-visible (CSS only)

In `styles.css`:

```css
:focus-visible {
  outline: 1px solid var(--color-ink);
  outline-offset: 1px;
}
```

plus a red variant for elements that sit on panels/canvas where ink is
invisible (or simply use ink everywhere — the canvas is near-black, ink reads
everywhere; the compare control and histogram sit on the image, so ink wins
there too). Rationale for 1px ink over 2px accent: the design language is
hairlines and hard edges; a 1px ink outline matches it and passes visibility on
both #111 and image content. Interactive elements already get focus by
default (buttons, range inputs); links don't exist in-app. No per-element
classes needed.

### D2 — Two reds: fill vs text

Add a token `--color-accent-text` for **red text on dark** (wordmark, "Save
failed", error copy, the export filename): ≈ **#ff2a2a** (computed ≈ 4.7:1 on
#111 — passes AA for normal text). Keep `--color-accent` (#cc0000) for **fills
with white text** (Save button, segmented active, slider thumbs, compare
segment) — white-on-#cc0000 passes at 5.9:1, and brightening the fill would
drop white-on-red below 4.5:1 (e.g. white on #ff2a2a ≈ 4.0:1 — fails). Two
tokens, two roles; document the rule in `styles.css` so future use doesn't
mix them.

Usage sweep: `text-accent` → `text-accent-text` where it's text-on-dark
(`top-bar.ts` wordmark + "Save failed", `gallery/view.ts` "Open photo" outline
button + notice bar, `lut-picker.ts` selected border stays accent).

### D3 — Gallery tile restructure

`gallery/view.ts`: wrap the tile in a `relative` div; the tile stays a
`button`; the delete ✕ becomes a **sibling** absolutely positioned over the
tile's corner (same visual placement as today — `absolute top-1 right-1` on
the wrapper). The delete button gets a solid `bg-panel/80` chip so it's
legible on any thumbnail. No layout change for sighted users; valid HTML for
everyone. (This also unblocks 06's delete-confirm work, which touches the same
spot.)

### D4 — Favicon

`public/favicon.svg` — a hard-cornered red square (the brand: 0 radius,
#cc0000 on transparent) + `<link rel="icon" type="image/svg+xml"
href="/favicon.svg">` in `index.html`. On-brand, one file, done.

## Resolved questions

- **Q1 — the accent-text red.** → Introduce `--color-accent-text` (#ff2a2a,
  ≈ 4.7:1 on #111) and use it for **all** red text on dark, **including the
  wordmark** (one class swap; it's a small-text failure for keyboard users
  otherwise). Fill red (#cc0000, white text at 5.9:1) is unchanged. Two
  tokens, two roles — the rule lives in `styles.css`.
- **Q2 — outline color.** → Ink (`--color-ink`), 1px, `outline-offset: 1px`.
  Visible on panels and on image content (compare control, histogram float
  over the photo), and no red-on-red failure on the red-filled Save button.

## Deferred (noted, not in this pass)

- Split-divider keyboard support (`role="separator"` + arrow keys) — pointer
  widget today; the compare control offers a keyboard-reachable alternative
  (segmented buttons) so the divider isn't an a11y blocker.
- `aria-pressed` on compare segments / export segmented rows (they read as
  toggle buttons; currently only `AriaLabel` — small, safe, can fold into any
  view-touching slice).
- Skip link, landmarks audit (the app shell is two routes, each with
  header/main/aside — already reasonable).

## Tests

No unit tests for CSS; verify visually (browser check per the project's
verification practice). The gallery tile restructure keeps all existing
behavior — run `gallery/` tests (`open-photo.test.ts` etc.) unchanged.
