# Compute shader pipeline over render pipeline

The engine targets WebGPU compute shaders rather than a vertex+fragment render pipeline, even though a render pipeline is the more direct analog to the mobile app's Skia RuntimeEffect model.

**Why compute:** Grain is a priority — the mobile app's cheap per-pixel hash is not acceptable for the web engine, and proper film-grain (FBM noise with density weighting) benefits from workgroup shared memory. Real clarity (local contrast via multi-tap kernel) also needs shared memory for efficient neighbor access. Both are compute-native patterns.

**Trade-off:** Compute shaders use `textureLoad` (integer coords, no filtering) instead of `textureSample` (free bilinear). This means manual sampling. The dispatch model adds boilerplate (workgroup sizing, storage texture format negotiation). The upside is scatter writes, shared memory, and a cleaner path to future features (histograms, LUT tetrahedral interpolation).

**Considered alternative:** A render pipeline with a full-screen quad and fragment shader maps cleanly to the mobile `main(vec2 coord)` pattern, gives free bilinear filtering, and has less boilerplate. It was rejected because grain quality is a core requirement and compute unlocks it.

**Consequences:** Every body renderer must use `textureLoad` (or manual bilinear) instead of `textureSample`. The chain assembler emits a `@compute` entry point with `@builtin(global_invocation_id)` rather than a fragment shader. Chromatic aberration's source-texture sampling must be explicit.

**Display path (added 2026-07):** Processing stays compute, but presentation is a second, trivial render pass — a fullscreen-triangle fragment shader that samples the compute output storage texture (bilinear, free) into the canvas swapchain. The frame never leaves the GPU on the display path; per-tick readback (copyTextureToBuffer + `mapAsync` + `createImageBitmap` + 2D `drawImage`) is gone, along with per-tick texture/buffer reallocation (resources are now image-scoped and reused). Readback survives only in the export path (`snapshot`). Renders are coalesced to one in flight (model `renderPending` + `queue.onSubmittedWorkDone`) so slider drags can't backlog the GPU queue.
