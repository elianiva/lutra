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

**Consequences**: browsers without WebGPU get an honest gate screen instead of a boot crash; everywhere else renders identically, from the same shaders, with export matching the displayed frame.
