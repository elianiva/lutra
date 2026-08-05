# Every failure is a tagged domain error; defects are tagged throws

Failures are modeled as `Schema.TaggedErrorClass` errors with a `message` and optional `cause` — never plain `Error` — and the foldkit message boundary carries the tagged error (instance or union), never a flattened string. Recoverable failures sit on the Effect error channel of commands; defects (impossible states, programmer errors) are *tagged throws* that still crash. The chain operations' never-thrown `LayerNotFoundError`/`InvalidPositionError` were deleted as dead code.

**Status**: accepted

**Considered Options**:

- **Plain `Error` + stringly message fields** (the pre-existing slop) — anonymous errors were constructed at 10 sites, flattened to `error: string` in every failure message, and one failure class (`GpuError`) was reused for a LUT network load it had nothing to do with. The tag, the cause chain, and the ability to discriminate failures all died at the message boundary.
- **Typed errors only on the Effect channel; strings at the message boundary** — half the taxonomy: commands would catch by tag, then flatten to `err.message` for the model. Rejected: the message schema is where the failure set gets *documented and enforced*, the model and views lose the cause chain, and retry/quota/corruption discrimination in the UI becomes impossible without string matching.
- **`Data.TaggedError` instead of `Schema.TaggedErrorClass`** — the engine's chain errors used it, but tagged errors now cross the foldkit message boundary as schema-validated values, so they must be Schemas. `LutParseError` already set the precedent: `Schema.TaggedErrorClass` can be thrown synchronously.
- **Defects as plain throws** — indistinguishable from any library throw, un-grep-able, uncatchable by tag. The tagged-throw posture (same convention as `parseCube` throwing `LutParseError`) keeps them identifiable while preserving their semantics as crashes.

**Implementation**: the frontend gained its first error module (`frontend/src/errors.ts`: `ImageDecodeError`, `ThumbnailEncodeError`, `MountElementError`, `CanvasUnavailableError`, `EditNotFoundError`, `UnknownFieldError`); the engine gained `UnknownLayerTypeError` (thrown by `createLayer`, reused by the frontend's `fieldBounds`) and `MissingLutReferenceError` (thrown by `generateChainSource`); the LUT store fails with `LutLoadError` (fetch) and passes the engine's `LutParseError` through unwrapped — the historical `GpuError` mislabel is gone. Every failure message now carries its error or a schema union naming the failure set (`SaveFailed` = `GpuError | StoreError | ThumbnailEncodeError`, `EditLoadFailed` = `EditNotFoundError | StoreError | ImageDecodeError`, `RenderFailed` = `CanvasUnavailableError | GpuError | LutLoadError | LutParseError`, …), and the model stores the instances (`source.error`, `saveStatus.error`, `exportError`, the gallery grid's `Failure`). Commands handle failures with `catchTag`/`catchTags` — the exhaustive-cases form forces a decision for every tag in the channel, so a new failure mode cannot silently ride an old message. `renderPending`'s "Canvas not ready" precondition and the stale-URL "edit not found" case, previously strings squatting in failure messages, are now tagged errors in the unions.

**Deliberate exceptions**: the GPU device-acquisition path still converts `GpuError` to a defect (`Effect.die`) — the app genuinely cannot work without a GPU (see `backend.ts`), and `EncodeError`'s `error?: string` in the encoder worker's postMessage protocol stays a string (structured-clone boundary, consumed into `EncodeError` at the seam).

**Consequences**:

- The message schemas are the single source of truth for "what can fail here"; adding a failure mode means consciously widening a union and its `catchTags` table.
- The chain ops remain total by contract (they return the chain unchanged on a miss); if a failing variant is ever needed, the error classes are reintroduced with a caller.
- Failure causes survive to the model and views, so retry affordances (network `LutLoadError` vs corrupt `LutParseError`), quota messaging, and diagnostics no longer need string parsing.
