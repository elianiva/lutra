# Lutra

A color-grading app for film simulation. Adjustments are non-destructive, ordered, and intentionally limited in scope.

## Language

**Adjustment layer**:
A sequential step in a non-destructive edit chain. Each layer consumes the result of the previous layer and produces a new one. There is no parallel compositing, no blend mode, and no mask at the layer level. Order matters; reordering re-runs the chain from that point.
_Avoid_: "Layer" on its own (ambiguous with Photoshop's parallel composited layer), "filter" (overloaded with Snapseed's Filters tab), "step".

**Film simulation adjustment**:
A product-level design constraint, not a feature flag. The prototype intentionally exposes a small palette of adjustments so the user can reach a film look quickly and is gently pushed away from runaway editing. Limitation is the feature.
_Avoid_: "Presets" (these are built-in looks, distinct from the adjustment primitives the user composes), "filters" (see above).

**Edit chain**:
The ordered list of **adjustment layers** applied to a single source image. The chain is the unit of non-destructive persistence: it can be saved, replayed, reordered, and pruned without touching the source image.
_Avoid_: "Stack" (Snapseed uses this word but it suggests LIFO; the chain is order-sensitive in both directions), "history" (history is a side effect, not the model).

### Adjustments

The v1 palette — nine **adjustment layer** types the user can add to the **edit chain**. No LUT yet (see Future). Order is significant.

1. **Exposure** — stops (-3 to +3, default 0). Multiplicative gain.
2. **Contrast** — S-curve amount (-1 to +1, default 0). Anchored at mid-gray.
3. **Shadows / Highlights** — single layer with two sliders (a.k.a. Snapseed's "Ambiance"). Shadows lifts dark tones; Highlights compresses bright tones.
4. **White balance** — temperature (K) + tint. Default 6500K / 0.
5. **Saturation** — multiplier (-1 to +1, default 0 = no-op).
6. **Grain** — film-grain noise overlay (0 to 1, default 0 = no-op). Hash-based, no texture.
7. **Vignette** — radial darkening from edges. Two sliders: amount (-1 to +1, default 0 = no-op) + size (0.2 to 1, default 0.6).
8. **Chromatic aberration** — radial R/B channel split (-1 to +1, default 0 = no-op).
9. **Clarity** — midtone contrast / structure enhancement (-1 to +1, default 0 = no-op).

### Future (not in v1)

Captured so they aren't lost:

- **LUT layer** — a layer type that applies a 3D color cube (`.cube` format) as a shader pass. Reference architecture: [YahiaAngelo/Film-Simulator](https://github.com/YahiaAngelo/Film-Simulator) (KMP + Skiko, bundles `.cube` files in resources). Our variant will **download LUTs at runtime** (not bundled), per product decision.
- Lift / gain / gamma (lifted blacks), masks, blend modes per layer.

## Flagged ambiguities

- **"Layer"** in this project is exclusively an **adjustment layer** (sequential). It is not a Photoshop-style composited layer. If we ever introduce the latter, the term must change.
- **"Filter"** is reserved for a finished look / preset, not a single adjustment. An **adjustment** is a primitive; a **filter** (if added) would be a named, ordered set of adjustments applied as one.

## Example dialogue

> Dev: "The user added a saturation layer — where does it go in the edit chain?"
> Expert: "Wherever they put it. If it's after the channel mix, it tints the whole shifted image. If it's before, it tints the pre-look image. Order is part of the look."
>
> Dev: "Should we add a LUT layer?"
> Expert: "Not in v1. LUTs are a future addition — capture it so we don't forget, but it doesn't go in the v1 palette."
