# Collage layout: explicit rows (M×N grids)

The collage's grid gains an explicit **row count** on the layout, alongside columns: the user sets an M×N grid (`3×1`, `3×4`, `1×4`, `1×3`, …) instead of rows being silently derived from the tile count. The Columns control's minimum drops from 2 to 1 so single-column and single-row strips are first-class.

## Why

Rows were the only grid dimension the user could not shape: `rows = ceil(tiles / columns)` fell out of the tile count, so a 2-column collage of 3 photos was always 2 rows, and there was no way to compose a deliberate 2×2 with a spare slot, a 1-wide film strip, or a 1-tall banner. Every other layout dimension — columns, gutter, frame ratio, background — is already an explicit, auto-saved control; rows was the odd one out.

### Considered options

- **Derive rows but let the user pad** (a separate "empty slots" control) — rejected: two controls for one dimension, and the record still couldn't express "this grid is 2×2".
- **Hard-clamp both axes against the tile count** (`rows ≥ ceil(count/columns)` enforced at every mutation edge) — rejected: the bounds become cross-coupled (the column minimum depends on rows, which depends on count), producing steppers that silently refuse for non-obvious reasons.
- **Drop surplus tiles when capacity shrinks** — rejected: destructive, and undo would have to cover layout changes it deliberately does not (docs/adr/0033).

## Design

`CollageLayout` gains `rows` (control range 1–6, like columns) with a decoding default of 1. Consumers compute the **effective** row count as:

```
effectiveRows = max(max(1, round(rows)), ceil(count / columns))
```

which yields three properties at once:

- **Legacy records render unchanged.** A pre-0035 record has no `rows`; it decodes to 1, and the derived term wins — exactly the old count-driven grid. No data migration.
- **Explicit M×N is honored whenever its capacity suffices.** Spare cells render as background in the preview (non-interactive placeholders), compose as background in export, and mirror in the gallery mini-preview.
- **Surplus photos never vanish.** If the tile count outgrows the requested grid, the derived term grows the grid instead — the pre-0035 behavior as a safety net rather than a constraint.

Nonsensical stored values (`NaN`, ≤ 0) fall back to the derived grid, matching how `frameRatio` guards its own degenerate inputs (docs/adr/0033).

### Consequences

- Export resolution math is unchanged in kind: the frame ratio still pins the composed frame's short edge; more rows means shorter cells, not a taller output. A 2×2 and a 2×1 of the same photos share the frame size and differ only in cell height.
- The Rows stepper auto-saves like every layout edge; layout changes stay un-undone (docs/adr/0033).
- `compose.ts` remains the single geometry source of truth for all three consumers (screen preview, gallery mini-preview, export); they gain the effective-row rule together.
