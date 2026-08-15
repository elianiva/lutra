# UI improvement plans

Planning docs for the UI pass, split by feature. Read them in numeric order;
each carries its own Status line, the decisions made so far (D1, D2…), and the
open questions with recommendations that still need answers before
implementation.

These are **plans, not ADRs**: an ADR gets written once a decision is made and
implemented (the existing docs/adr/00xx convention). When a plan lands, its key
decisions fold into `context.md` and the implementation rationale goes into an
ADR (or an existing one is extended).

Plans 01–06 are fully decided (2026-08-07 planning session): the open
questions in each were resolved one by one and baked into the files as
`Resolved questions` / `Decided` sections.

| # | Feature | Status |
|---|---------|--------|
| 01 | Undo / redo | **Decided — ready to implement** |
| 02 | Keyboard shortcuts | **Decided — ready to implement** |
| 03 | Slider reset + center-zero marker | **Decided — ready to implement** |
| 04 | Back navigation + dirty state | **Decided — ready to implement** |
| 05 | A11y pass | **Decided — ready to implement** |
| 06 | Gallery + tool panel freebies | **Decided — ready to implement** |
| 07 | LUT bar (bottom filmstrip picker) | **Implemented** — docs/adr/0012 |
| 08 | Component pattern (idiomatic Effect views) | **Implemented** — reference: `editor/lut-bar/` |
| 09 | RAW support (owned LibRaw wasm build → sRGB-16 source) | **Decided — ready to implement** (docs/adr/0014 + `09-raw-support.md`) |
| 10 | PWA + offline support (offline library) | **Implemented** — docs/adr/0015 |
| 11 | Informative tool panel cards | **Implemented** — docs/adr/0016 |
| 12 | Mobile support UI | **Implemented** — `12-mobile-ui.md` |

Scope (agreed): **functional + a11y**. Visual polish (motion, histogram
upgrade, LUT picker search) is deliberately out of this pass — see
`01-undo-redo.md` for the exact boundary. Plan 09 is outside the UI pass
(feature work); it sits in this index because it is the same plan/ADR
convention. Plan 10 (PWA/offline) is likewise outside the UI pass — feature
work, same convention.
