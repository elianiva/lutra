# Rendering engine

## Engine choice

Lutra grades images entirely on the GPU through **WebGPU compute shaders** — no Canvas 2D path, no WASM fallback, no CPU compute path. WebGPU matches the mobile app's Skia performance profile for 10+ chained adjustment passes at interactive frame rates, adds scatter writes and shared memory for compute-native effects, and carries zero binary overhead. Canvas 2D (CPU pixel-buffer round-trips per layer), WASM CPU processing (multi-MB binary, no GPU), WebGL (dated stateful API, poor fit for composed compute passes), and a vertex+fragment render pipeline (no scatter/shared-memory story for film grain and local contrast) were all rejected.

Compute shaders sample explicitly: filtered reads go through `textureSampleLevel` on the binding-5 sampler (`textureSample` is fragment-stage only); `textureLoad` serves integer texel access and unfilterable formats. Filtered sampling requires filterable formats — which is why passes ping-pong through rgba16float intermediates rather than rgba32float (rgba32float stays for unfilterable LUT cubes).

## Chain pipeline

- **One compute pass per layer**, never a single fused pass: texture-sampling layers must see the accumulated result of earlier layers, not the source image.
- Passes ping-pong through **linear-light** rgba16float intermediates; only the last pass encodes back to sRGB. A dedicated linearize pass precedes the first sampling layer.
- Body contract: bodies see linear light — with exactly one exception. **LUT bodies see sRGB-encoded values**: the vendored film LUTs are authored against G'MIC's sRGB working space, and their lift/toe behavior only reads correctly there. The assembler inverts the color-space flags around a LUT pass and skips the round-trip at chain ends (the source and display textures are already sRGB).
- Body renderers declare resource needs structurally (`samplesInput`, `needsLut`) instead of WGSL string inspection.
- Presentation is a separate trivial **render pass**: a fullscreen-triangle blit samples the compute output into the canvas swapchain (free bilinear). The frame never leaves the GPU on the display path; readback exists only in the export/snapshot path.
- Resources are **persistent and image-scoped**: the source uploads once per image; intermediates, uniform buffers, and bind groups are cached per size. A slider tick is two buffer writes + two dispatches + submit — zero allocations, no sync points.

## Render coalescing

Renders are latest-wins and coalesced to one in flight (`renderPending` plus a revision stamp; the completion handler re-dispatches with the latest chain/draft when its stamp is stale). GPU queue depth stays bounded regardless of pointer-event rate, and grain keeps animating (`u_frame` increments per dispatch).

## Capability gate

A missing WebGPU is a gated capability, never a crash:

- A boot-time probe (`navigator.gpu` presence + `requestAdapter()`) becomes `WebGpuCapability` on the root model; unsupported devices get a remediation screen and never enter the editor, so the GPU backend is never touched there.
- GPU device acquisition is lazy: the resources Layer builds GPU-free at boot (a Layer build failure would escape as a crash) and acquisition fails with typed `GpuError` on first use instead of dying.
- A CPU grading fallback is explicitly rejected: no browser-deployable WGSL runtime exists, and CPU pixel work is orders of magnitude too slow to edit with. Revisit only if a viable in-browser path appears.

## 6K / high-resolution hardening (P0–P6)

- **Preview grading (P0) + adapter limits (P1)** are the 6K fix: editor grades at preview resolution (`PREVIEW_LONG_EDGE = 2048`, ~2.8 Mpx vs 24 Mpx) and re-executes at native on export (detached canvas). Device is acquired with `requiredLimits: { maxTextureDimension2D: adapter.limits.maxTextureDimension2D }` so a capable GPU's 8192/16384 cap is actually granted (default is 8192, compat is 4096).
- **P2 clamp** — `backend.ts` clamps `canvas.width/height` to `device.limits.maxTextureDimension2D` before `ctx.configure()` / `resizeCanvas()`. Defensive: preview side-by-side is 4096 and fits 8192, but a stale 12000-wide canvas (6k side-by-side without P0) or a compat 4096 device would otherwise throw. Blit UV is derived from `u_canvas`, so clamped halves stretch rather than crash.
- **P3 lazy intermediates** — `Session.intermediates` is `null` for passthrough / single-pass preview; allocated lazily in `execute` when `passes.length > 1`. Saves ~366 MiB on a 6k empty chain; first layer add allocates once.
- **P4 preview decode** — `gpu/preview.ts:toPreviewBitmap` is the single source of truth for the editor preview. `DecodeImage` and `LoadEdit` in `editor/command.ts` downscale via it after a single `createImageBitmap` decode; the 2D-canvas `drawImage` path is kept (Safari ignores `createImageBitmap(file, { resizeWidth })`). No extra native decode on `LoadEdit` hot path beyond the one needed — the store bytes decode once and `toPreviewBitmap` closes the native bitmap when a preview is created.
- **P5 transactional session + bitmap hygiene + device lost** — `buildSession` tracks allocations and cleans up on throw; `ensureSession` builds before destroying old (no leak on OOM); `destroySession` closes `srcBitmap`; `update.ts` closes `model.source.bitmap` on replace/clear (6k bitmap ≈70 MiB CPU); `device.lost` handler clears `sessionRef` + `gpuCtxRef` so the next `execute` re-acquires without reload.
- **P6 export/save mop-up** — `encode/worker-layer.ts` clones the frame then transfers the clone's buffer (`worker.postMessage(req, [cloneBuffer])`) so the 6k/12Mpx export snapshot (~24–92 MiB) is not structured-cloned while the slotted frame stays intact for tweak-and-re-export (no detached 0-length buffer on second encode); guard falls back on non-transferable/SharedArrayBuffer. `SaveEdit`'s thumbnail derives from the same preview-sized snapshot (FHD-class, ~11 MiB), so no 91 MiB double allocation; the full-res native path is export-only on a detached canvas (`SnapshotForExport`). `canvas-stage.ts:CompareDivider` coalesces `pointermove` via rAF (one `ChangedSplitPosition` per frame), and `editor/update.ts` coalesces `PresentFrame` (one blit in flight, `presentPending`/`pendingPresent` flush on `FramePresented` after `queue.onSubmittedWorkDone()` — divider drag at 240 Hz emits ≤60 blits, mirrors `renderPending`/`revision` coalescing; both `ChangedSplitPosition` and `ChangedCompareMode` occupy the pending slot when a blit is in flight). `gpu/backend.ts:present` awaits `onSubmittedWorkDone()` before `FramePresented` so `presentPending` covers actual GPU time, not just submit.

**Consequences**: browsers without WebGPU get an honest gate screen instead of a boot crash; everywhere else renders identically, from the same shaders, with preview grading matching export at native resolution. 6K photos fit default limits, idle VRAM drops an order of magnitude on empty chains, a lost device / failed allocation no longer wedges the editor, export avoids a 92 MiB clone, and divider drag no longer queues a blit per pointermove.
