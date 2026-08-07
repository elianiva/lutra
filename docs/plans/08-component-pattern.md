# Component pattern (idiomatic Effect views)

Status: **Implemented** (2026-08-07) — reference implementation: `packages/frontend/src/editor/lut-bar/`. Everything in this plan was applied in the same session; the audit table below records what changed.

## Goal

Make every frontend view, update loop, and helper read like `editor/lut-bar/`: expression pipelines over Effect combinators, `Match` for union dispatch, `Option` for conditional rendering, and return-type annotations only when they earn their keep — the type-checker infers the rest. The lut-bar directory is the canonical example of every rule below.

## The pattern (the checklist)

A component is a **directory**, not a file:

- `index.ts` — barrel: re-exports the public surface only (`lut-bar/index.ts`).
- One file per role: the top-level view (`bar.ts`), pure view atoms (`tab.ts`, `thumb.ts`), pure data logic (`catalog.ts`, `target.ts`), and Effect mounts (`wheel.ts`).
- A view is a **pure function of `(h, model)`** — no state, no DOM access, no side effects. Side effects live in `Mount.define`/`Mount.defineStream` blocks (`wheel.ts`, the `PanZoom` family in `canvas-stage.ts`).

Composition rules:

- **Conditional rendering is an Option pipeline**: `Option.all([...])` → `Option.filter` → `Option.map` → `Option.getOrNull` for "render only when everything present" (the bar's visibility). View-local absence is a plain `null` child (foldkit renders null children); never a fabricated empty `h.div([], [])`.
- **Union dispatch is `Match`**: `Match.value(x).pipe(Match.withReturnType<T>(), Match.when(S.is(...), ...), Match.orElse(...))` — with schema guards (`S.is`) for domain unions. Never `switch` statements. `Match.tagsExhaustive` for message-union update loops (both `update.ts` files already did this). Plain `_tag ===` predicates stay only for boolean helpers (`hasImage`, `canPickTool`).
- **Data plumbing is `pipe`**: `Array.groupBy`/`Record.toEntries`, `Array.findFirst`, `Option.orElse`/`Option.match`/`Option.contains`, `Option.fromNullishOr` for `Schema.NullOr` model fields.
- **Schema guards for narrowing**: `S.is(LutLayer)`, `S.is(Drafting)` at Match arms; manual `type`/`_tag` checks only where the value is already statically narrowed (a typed `Layer` union narrows with `layer.type === 'lut'` for free).

Annotation policy:

- **No return-type annotation when TS infers it** — that is most functions. `lutBar`, `tab`, `thumb`, `groupByCategory`, `lookup`, `lutTarget`, `currentLutId`: all unannotated.
- **Keep** annotations only for: `Match.withReturnType<T>()` (Match cannot infer branch unions), exported contract types (`UpdateReturn`, `InitReturn`, `Document`), Effect error-channel signatures (command/store/GPU internals), named types that must exist (`LutTarget`, `Model`), and error-contract helpers (`asHtmlElement`, `fieldBounds`).
- Parameters are always annotated; `import type` for type-only imports.

Comments carry the **why**: invariants, unreachable branches, and fallbacks are documented at the definition site (`currentLutId`'s unreachable-from-bar note, `recentsEntries`' stale-reference drop, `groupByCategory`'s first-seen-order note).

## Decisions

### D1 — Annotation policy

Drop every inferable return-type annotation; keep the list above. Evidence this is safe: the reference file exports `lutTarget` and `currentLutId` unannotated and `tsc --noEmit` stays green; the migration below dropped ~15 annotations with zero type errors.

### D2 — `switch` is banned for union dispatch

The codebase had exactly two `switch` dispatchers left (`root/update.ts` on `message._tag`, `root/init.ts` on `route._tag`) plus an if/else chain (`root/view.ts` `activeRoute`). All converted to `Match.tagsExhaustive` / `Match.when(S.is(...))` / `Match.orElse`. The only remaining `switch` is `components/icon.ts`'s tag-name string dispatch, which is the right tool there.

### D3 — Empty-div placeholders are banned

`export-dialog.ts` `qualitySection` returned `h.div([], [])` for lossless formats. Replaced with a `null` child (ternary), matching `canvas-stage.ts`'s `compareMode === 'split' ? splitDivider(...) : null` precedent and lut-bar's `Option.getOrNull` boundary.

### D4 — Typed dispatch instead of casts

`export-dialog.ts` `segmentedRow` was string-typed, forcing two `consistent-type-assertions` suppressions. Made generic (`<T extends string | number>`) so the format and scale rows dispatch with statically-typed values — both suppressions deleted.

### D5 — Status text is a data pipeline

`top-bar.ts` `saveStatusText` (if/else + `return null`) and `export-dialog.ts` `statusSection` (`let content: string` + if/else) became `Match` / Option pipelines over the model's status unions.

## Current state (audit, 2026-08-07)

| File | Before | After |
|---|---|---|
| `editor/lut-bar/` | — | The reference; already conformant |
| `editor/update.ts`, `gallery/update.ts` | `Match.tagsExhaustive`/`M.tags` + `exhaustive` ✅ | Conformant; dropped 2 redundant annotations (`ensureFieldIndex`, `presentState`) |
| `editor/phase.ts`, `model.ts`, `message.ts`, `command.ts`, `luts/store.ts`, `gpu/*`, `encode/*` | Effect/Schema idioms ✅ | Conformant; dropped `hasImage`'s `: boolean` |
| `editor/view.ts`, `tool-panel.ts`, `layer-drawer.ts` | Close | Conformant; dropped `canPickTool: boolean`, `num: number`, `summary: string` |
| `editor/top-bar.ts` | `saveStatusText` if/else + bare `null` | `Match.value(model.saveStatus)` + `withReturnType<Html>()` |
| `editor/export-dialog.ts` | `let content` if/else; empty-div placeholder; string-typed `segmentedRow` + 2 casts | `exportStatusText` Option pipeline; `null` section; generic `segmentedRow`; dropped `fmtBytes: string` |
| `editor/canvas-stage.ts` | stage pick ternary chain | `Match.value(model.phase)` with `S.is(Empty/Loading/ErrorState)` |
| `root/update.ts` | `switch (message._tag)` + nested `switch (route._tag)` | `Match.tagsExhaustive` + `applyRoute` helper with `Match.when(S.is(...))`; dropped `withRoute: Model` |
| `root/view.ts` | `activeRoute` if/else chain | `Match.value(model.route)` with `S.is(GalleryRoute/EditorRoute)` |
| `root/init.ts` | IIFE-wrapped `switch (route._tag)` | `Match.when(S.is(...))` + `Match.orElse(() => [])` |
| `gallery/view.ts` | `const grid: AsyncData.AsyncData<...>` annotation | `const grid = model.grid` |
| `editor/layer-meta.ts` | `: string` on formatters, `lutName`, `num` | Dropped |

## Verification

- `pnpm --filter @lutra/frontend typecheck` — clean.
- `pnpm lint` — clean (the one remaining `switch` is `components/icon.ts`'s tag-name dispatch, kept by D2).
- `pnpm test` — engine 60 + frontend 123, all green.
- Pure style refactor: no behavior change anywhere (no message, command, model, or view output was altered).
