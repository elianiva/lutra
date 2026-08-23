# Editor & gallery UI conventions

## Compare presents without re-rendering

Presentation state (compare mode, split position) lives in the model and dispatches blit-only presents — never a chain re-render. Re-rendering per divider tick wastes GPU work on large images and animates grain mid-drag. Side-by-side widens the single canvas to 2× the image width (a session rebuild, still blit-only) so both halves show native resolution.

The principle generalizes: **presentation-only state lives in the model, applies at render time, never touches the committed chain or the phase machine.** Hover LUT previews and Color Mixer range selection follow it.

## Tool panel

Desktop shows an icon rail; each tool's label + two-line description (what it does / when to reach for it) appears in a custom hover tooltip — printed directly on cards where hover doesn't exist (mobile). The copy is hand-authored from the shader bodies, because several tools deliberately diverge from generic photo-editing semantics (chromatic aberration is an aesthetic film effect, not lens correction), and is locked by scene tests. A muted ×N badge marks tools already in the chain — derived at render time, no model state; it quietly reinforces the anti-runaway-editing philosophy. The LUT card leads the picker and doubles as LUT library load status while the catalog loads/fails.

**Off-default affordances appear conditionally**: a control's reset shows only while its value diverges from default — conditional presence is both the discoverability and the signal.

## Destructive actions

No native `confirm()`. Friction is proportional to recoverability: Edit deletion (destructive, irreversible) uses a modal dialog; collage deletion (recoverable by recreation) uses an inline two-step confirm on the card.

## Gallery behaviors

**Open photo is multi-select**: every picked photo becomes its own persisted Edit, but only a _single_ pick opens the editor — a batch stays on the gallery ("open the editor" has no meaning for a batch). Per-file isolation under `Effect.partition` means one bad file never loses the batch; failures aggregate into one report. The fresh listing rides inside the result message so grid refresh and failure notice land atomically (a dispatched re-list would wipe the notice).

## Responsive & touch

One view tree with responsive classes — **no viewport state in the model**, so jsdom scene tests keep finding every element. Below desktop: canvas-first column, panels collapse to bottom sheets toggled by a tab bar, and picking a tool flips to the working sheet. Touch: pinch zoom about the live midpoint, double-tap fit ↔ 2×, `touch-none` stage, larger coarse-pointer hit targets. Chrome-safe shell: `100dvh` height tracking, safe-area insets.
