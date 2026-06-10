# Ruler slider with toggled parameters

Replaced the standard track-and-thumb slider with a ruler-style slider: a horizontal scale with tick marks that moves behind a fixed center indicator, like a camera dial. The ruler scrolls via horizontal swipe, with ticks fading near the edges to create a circular illusion.

Two layers (White balance, Vignette) have **toggled parameters** — two parameters sharing one layer, one visible at a time. The user clicks the label (indicated by a ⇅ icon) to switch. This groups related parameters under one mental model while keeping the one-ruler-at-a-time constraint. Shadows and Highlights were split into separate layers to maintain the single-parameter-per-layer rule where parameters are independent.

## Considered Options

- **Merged sliders (old)** — two sliders stacked in one layer. Rejected because the new ruler design only shows one ruler at a time, and two stacked rulers would lose the "camera dial" metaphor.
- **Fully split everything** — White balance becomes `temperature` + `tint` as separate layers, Vignette becomes `vignette-amount` + `vignette-size`. Rejected for White balance (temperature and tint are always adjusted together — splitting forces two layers for one mental action). Accepted for Shadows/Highlights (independent parameters).
- **Toggled parameters** — one ruler, click label to switch. Chosen because it preserves the grouping while respecting the one-ruler constraint.

## Consequences

- `Params` component must support `toggled` field definitions and render a label with ⇅ icon.
- Layer registry entries for White balance and Vignette need a `toggled: true` flag and two field definitions.
- Shadows and Highlights are now separate layer types (registry entries, shader bodies, etc.).
- `CONTEXT.md` glossary updated to document toggled parameters and the split.
