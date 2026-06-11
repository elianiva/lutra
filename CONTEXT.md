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

The v1 palette — ten **adjustment layer** types the user can add to the **edit chain**. No LUT yet (see Future). Order is significant.

Most layers expose a single parameter with one ruler slider. Two layers — **White balance** and **Vignette** — have **toggled parameters**: two parameters sharing one layer, one visible at a time. The user clicks the label (indicated by a ⇅ icon) to switch between them. This groups related parameters under one mental model while keeping the one-ruler-at-a-time constraint.

1. **Exposure** — stops (-3 to +3, default 0). Multiplicative gain.
2. **Contrast** — S-curve amount (-1 to +1, default 0). Anchored at mid-gray.
3. **Shadows** — lifts dark tones (-1 to +1, default 0 = no-op).
4. **Highlights** — compresses bright tones (-1 to +1, default 0 = no-op).
5. **White balance** — toggled: temperature (K, default 6500) ↔ tint (-1 to +1, default 0).
6. **Saturation** — multiplier (-1 to +1, default 0 = no-op).
7. **Grain** — film-grain noise overlay (0 to 1, default 0 = no-op). Hash-based, no texture.
8. **Vignette** — toggled: amount (-1 to +1, default 0 = no-op) ↔ size (0.2 to 1, default 0.6).
9. **Chromatic aberration** — radial R/B channel split (-1 to +1, default 0 = no-op).
10. **Clarity** — midtone contrast / structure enhancement (-1 to +1, default 0 = no-op).

### Screens

**Main menu**:
The app's entry screen. Shows the app name (**LUTRA**, left-aligned) and a grid of **saved edits** (3-column, square-cropped thumbnails). Top-right icons: **+** (start new edit → picker → **editor**), **→** (open **options screen**). Empty state shows "Start editing" button with "Your edits will appear here" subtitle.
_Avoid_: "home" (iOS-centric, ambiguous with system home), "start screen" (ambiguous), "landing" (web jargon).

**Editor**:
The color-grading screen that renders an **edit chain** for one image. Reached from **main menu** → **+** → picker → image selected, or by tapping a **saved edit** (resumes the chain). No-image empty state is dead code.
_Avoid_: "color grading menu" (the menu is the main menu, not this), "workspace" (overloaded), "canvas" (only the top half is a canvas).

**Options screen**:
Settings surface with storage info. Reached from **main menu** → **→** icon. Shows edit count and total storage used. Includes "Clear all" action (deletes all **saved edits** and source images, with confirmation).
_Avoid_: "settings" (Android-centric), "preferences" (macOS-centric), "config".

### Saved edit

A persisted record of a user's work: source image file + **edit chain** + thumbnail. Stored in SQLite with file references in the local file system. Grid on the **main menu** displays **saved edits** sorted newest-first.

### Back behavior

Leaving the **editor** (back button, gesture) **auto-saves** the current session as a **saved edit**. The **main menu** always reflects the latest state. If the chain is unchanged from the last save, no duplicate is created.

### Grid actions

Long-press on a **saved edit** in the **main menu** grid shows a context menu: **Duplicate** (shallow copy — same source file, new edit entry with identical chain) and **Delete** (removes saved edit + our copy of the source file). Export is only available from within the **editor**.

### Future (not in v1)

Captured so they aren't lost:

- **LUT layer** — a layer type that applies a 3D color cube (`.cube` format) as a shader pass. Reference architecture: [YahiaAngelo/Film-Simulator](https://github.com/YahiaAngelo/Film-Simulator) (KMP + Skiko, bundles `.cube` files in resources). Our variant will **download LUTs at runtime** (not bundled), per product decision.
- Lift / gain / gamma (lifted blacks), masks, blend modes per layer.
- **Storage management** — soft/hard caps on saved edits, per-edit storage info, cleanup suggestions.

## Flagged ambiguities

- **"Layer"** in this project is exclusively an **adjustment layer** (sequential). It is not a Photoshop-style composited layer. If we ever introduce the latter, the term must change.
- **"Filter"** is reserved for a finished look / preset, not a single adjustment. An **adjustment** is a primitive; a **filter** (if added) would be a named, ordered set of adjustments applied as one.

## Example dialogue

> Dev: "The user added a saturation layer — where does it go in the edit chain?"
> Expert: "Wherever they put it. If it's after the channel mix, it tints the whole shifted image. If it's before, it tints the pre-look image. Order is part of the look."
>
> Dev: "Should we add a LUT layer?"
> Expert: "Not in v1. LUTs are a future addition — capture it so we don't forget, but it doesn't go in the v1 palette."
