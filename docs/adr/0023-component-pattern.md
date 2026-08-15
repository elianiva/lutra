# Component pattern: idiomatic Effect views

Every frontend view, update loop, and helper reads like `editor/lut-bar/`:
expression pipelines over Effect combinators, `Match` for union dispatch,
`Option` for conditional rendering, return-type annotations only when they
earn their keep.

**Status**: implemented (2026-08-07). Reference implementation:
`packages/frontend/src/editor/lut-bar/`.

## The pattern

A component is a **directory**, not a file: `index.ts` barrels the public
surface only; one file per role (top-level view, pure view atoms, pure data
logic, Effect mounts). A view is a **pure function of `(h, model)`** — no
state, no DOM access, no side effects; side effects live in
`Mount.define`/`Mount.defineStream` blocks.

- **Conditional rendering is an Option pipeline**: `Option.all` →
  `Option.filter` → `Option.map` → `Option.getOrNull`; view-local absence is
  a plain `null` child, never a fabricated empty `h.div([], [])`.
- **Union dispatch is `Match`**: `Match.value(x).pipe(Match.withReturnType<T>(),
Match.when(S.is(...), ...), Match.orElse(...))` — with schema guards for
  domain unions. No `switch` statements (the one remaining `switch` is
  `components/icon.ts`'s tag-name string dispatch, which is the right tool).
- **Data plumbing is `pipe`**: `Array.groupBy`/`Record.toEntries`,
  `Array.findFirst`, `Option.orElse`/`match`/`contains`,
  `Option.fromNullishOr` for `Schema.NullOr` fields.
- **Schema guards for narrowing**: `S.is(LutLayer)`, `S.is(Drafting)` at
  Match arms; manual checks only where the value is already statically
  narrowed.

## Decisions

### D1 — Annotation policy

No return-type annotation when TS infers it (most functions). Keep
annotations only for: `Match.withReturnType<T>()`, exported contract types
(`UpdateReturn`, `InitReturn`, `Document`), Effect error-channel signatures
(command/store/GPU internals), named types that must exist (`LutTarget`,
`Model`), error-contract helpers. Parameters always annotated; `import type`
for type-only imports. Verified safe: `tsc --noEmit` stayed green while
dropping ~15 annotations.

### D2 — `switch` is banned for union dispatch

The codebase's two `switch` dispatchers (`root/update.ts`, `root/init.ts`)
and the if/else chain (`root/view.ts` `activeRoute`) converted to
`Match.tagsExhaustive` / `Match.when(S.is(...))` / `Match.orElse`. Update
loops use `Match.tagsExhaustive` for message unions.

### D3 — Empty-div placeholders are banned

`export-dialog.ts`'s `qualitySection` returned `h.div([], [])` for lossless
formats; replaced with a `null` child — matching `canvas-stage.ts`'s
`compareMode === 'split' ? splitDivider(...) : null` precedent.

### D4 — Typed dispatch instead of casts

`export-dialog.ts` `segmentedRow` was string-typed, forcing two
`consistent-type-assertions` suppressions; made generic
(`<T extends string | number>`) so format/scale rows dispatch with
statically-typed values — both suppressions deleted.

### D5 — Status text is a data pipeline

`top-bar.ts` `saveStatusText` (if/else + `return null`) and
`export-dialog.ts` `statusSection` (`let content` + if/else) became Match /
Option pipelines over the model's status unions.

## Consequences

- Comments carry the **why**: invariants, unreachable branches, and fallbacks
  documented at the definition site; no "what" comments.
- Applied repo-wide in one pass: `editor/update.ts`, `gallery/update.ts`,
  `editor/view.ts`, `tool-panel.ts`, `layer-drawer.ts`, `top-bar.ts`,
  `export-dialog.ts`, `canvas-stage.ts`, `root/*`, `gallery/view.ts`,
  `layer-meta.ts`. Pure style refactor — no message, command, model, or view
  output was altered; verified by typecheck, lint, and the full test suite.
