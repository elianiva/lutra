# Architecture Decision Records

Durable architectural context only — what we decided, why, and what it constrains going forward. No dates, no implementation narratives, no plans: decisions that were never built don't live here. New ADRs take the next number and are referenced from code comments as `docs/adr/NNNN-name` (or `ADR NNNN` in prose).

| #                                        | Record                                                      | Scope                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0001                                     | [Rendering engine](0001-rendering-engine.md)                | WebGPU compute choice, chain pipeline semantics, coalescing, capability gate               |
| 0002                                     | [LUT library](0002-lut-library.md)                          | Vendored source, LUT bar browsing contract, per-photo thumbnails                           |
| 0003                                     | [Adjustment layers](0003-adjustment-layers.md)              | Layer-addition pattern, Color Mixer, Tone Curve                                            |
| 0004                                     | [Export](0004-export.md)                                    | Post-scale decision, encoder service, shared export dialog submodel                        |
| 0005                                     | [Storage](0005-storage.md)                                  | @lutra/store package, self-contained records on IndexedDB                                  |
| 0006                                     | [Frontend architecture](0006-frontend-architecture.md)      | Root submodel + route arms, error taxonomy, component pattern, view memoization discipline |
| 0007                                     | [Offline support](0007-offline.md)                          | Page-driven fill, dumb service worker, cache lifetimes                                     |
| 0008                                     | [RAW decode](0008-raw-decode.md)                            | Owned LibRaw wasm build, decode settings, licensing posture                                |
| 0009                                     | [Collage](0009-collage.md)                                  | Composition by reference, previews/export, layout model                                    |
| 0010                                     | [Editor & gallery UI conventions](0010-editor-ui.md)        | Compare presentation rule, tool panel, destructive actions, multi-select, responsive/touch |
| [Depth of field](0011-depth-of-field.md) | Focal-plane depth blur layer — decided, not yet implemented |
