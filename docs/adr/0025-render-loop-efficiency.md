# Render loop efficiency: blit display, persistent resources, latest-wins coalescing

The slider effect "isn't applied correctly" was a latency/backlog problem,
not a shader bug: every `OnInput` event enqueued a full render, and each
render was a full GPU→CPU→GPU round trip. This record captures the diagnosis
and the structural fixes that landed.

**Status**: implemented (2026-07-31).

## Diagnosis (per `GpuBackend.execute()` tick, as built)

1. `copyExternalImageToTexture` re-uploaded the **entire source image**,
   which never changes during a drag.
2. Fresh allocations (srcTex, dstTex, uniform buffers, bind group) destroyed
   at the end of the same tick.
3. `readBack` — `copyTextureToBuffer` + **`mapAsync` (a hard GPU sync
   point)**, row unpadding on CPU, `new ImageData`, `createImageBitmap` (CPU).
4. `RenderedFrame` → `PaintCanvas` → 2D `drawImage` — re-uploaded the full
   image back to the GPU for display.

Net per tick: 2 full-image GPU transfers, 1 main-thread stall, 2 CPU pixel
copies, ~8 GPU allocations. Renders outran the event interval, work piled up
in the command queue, and the stale-stamp guard dropped _late results_ only
after the GPU work ran — so the image trailed the slider and the backlog
persisted after the drag.

## Decisions (what landed)

### D1 — Kill the display readback; present via a WebGPU canvas blit

The center canvas becomes a WebGPU canvas; the backend gains a blit render
pipeline (fullscreen triangle from `vertex_index`, fragment does
`textureSample` of the processed texture — free bilinear — to the swapchain).
`execute()` = one encoder, one submit: compute pass → dstTex, blit → canvas.
No readback, no CPU pixels, no 2D canvas on the display path. Empty chains
are allowed through the render path (the assembler already emits a
passthrough for `[]`); `PaintInitial`/`paintBitmap` and the `ImageDecoded`
empty-chain branch are deleted. **Export keeps a readback** — PNG needs CPU
pixels — but it runs only on the export click (one-time cost); the model
trades `renderedBitmap` for a `hasRendered` flag.

### D2 — Persistent, image-scoped resources

`srcTex` uploads once per image and lives for the image's lifetime; `dstTex`

- blit resources are cached per image size; param/resolution buffers and the
  bind group join the existing pipeline cache. A slider tick becomes:
  `writeBuffer(params)` + `writeBuffer(frame)` + 1 compute dispatch + 1 blit
  dispatch + submit. Zero allocations, no sync.

### D3 — Coalesce renders (latest-wins)

The model gains a `renderPending` flag: `renderNow` skips dispatch when a
render is in flight and just marks pending (revision still bumps). The
`RenderedFrame` handler, instead of dropping a stale result outright,
re-dispatches with the **latest** chain+draft when `stamp < revision` and a
render is pending. Result: at most one render in flight, always converging on
the newest slider value; GPU queue depth bounded to ~1–2 regardless of
pointer event rate. `u_frame` still increments, so grain keeps animating.

### D4 — WGSL micro-optimizations

Vectorized sRGB conversion (one `select` + one `pow` on `vec3<f32>`), the
grain `sin()` hash replaced with an integer hash (no transcendentals), and
`@workgroup_size(16, 16)` (named constant). The uniform-alias lets,
`u_resolution` uniform, and the single linear round trip stayed as-is —
negligible or inherent.

## Consequences

- The engine API changed: `render` / the old `GpuBackend` service are gone —
  `createRenderRequest` (pure assembly + uniform packing) + frontend-owned
  `GpuBackend` with `execute`/`snapshot` replace them.
- Blit `textureSample` gives free bilinear downscaling for zoom-out; zoom-in
  stays CSS-scaled.
- `bytesPerRow` 256-alignment only matters for the export readback now.
- The display path is compute + blit; see docs/adr/0001 for the pipeline
  baseline. The happy-dom tests don't cover the backend; it stays
  unit-test-free.
