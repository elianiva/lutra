# Slider latency + WebGPU efficiency plan

Status: implemented (2026-07-31) — Phases B–E landed in one pass; Phase A
(baseline measurement) was skipped per the user's call (they smoke-test by
hand). See the diff for details.

## 1. Diagnosis: why the slider effect "isn't applied correctly"

The math is fine — the problem is latency and backlog in the render path. Every
`OnInput` slider event fires `UpdatedDraftParam`/`UpdatedLayerParam` →
`renderNow` → a `RenderChain` command. There is **no coalescing**: a fast drag
enqueues one full render per pointermove, and each render costs a full
GPU→CPU→GPU round trip:

Per `GpuBackend.execute()` tick (packages/frontend/src/gpu/backend.ts):

1. `copyExternalImageToTexture` — re-uploads the **entire source image**,
   which never changes during a drag.
2. Fresh allocations: srcTex, dstTex, resolution/frame/params buffers, bind
   group — destroyed at the end of the same tick.
3. `readBack` — `copyTextureToBuffer` + **`mapAsync` (a hard GPU sync point)**,
   row unpadding on CPU, `new ImageData`, `createImageBitmap` (CPU).
4. `RenderedFrame` → `PaintCanvas` → 2D `drawImage` — re-uploads the full image
   back to the GPU for display.

Net per tick: 2 full-image GPU transfers, 1 main-thread stall, 2 CPU pixel
copies, ~8 GPU allocations, and a second full-image upload for presentation.

Because renders take longer than the event interval, work piles up in the
command queue. `RenderedFrame`'s stale-stamp guard (update.ts) drops *late
results*, but the GPU work still ran — so the displayed image trails the slider
and the backlog persists after the drag ends. That backlog, not a shader bug, is
what reads as "the effect is not applied correctly."

## 2. Where the wins are

| Lever | Est. impact | Cost |
|---|---|---|
| Kill per-tick readback; present via WebGPU canvas blit | ~10× on large images | Medium |
| Persistent textures/buffers (no per-tick allocation/re-upload) | slider tick → sub-ms | Medium |
| Coalesce in-flight renders (latest-wins) | fixes visible lag/backlog | Small |
| WGSL micro-opts (vectorized sRGB, integer hash, workgroup size) | ~1.2–1.5× shader | Small |

The WGSL from the SkSL port is *mostly fine*: single merged compute shader,
`textureLoad`/`textureStore`, one linear round trip — all correct. The
structural inefficiencies above dominate; the shader-text tweaks are the tail.

## 3. Phases

> All phases below are implemented. The key deliverables: no readback on the
> display path (compute + blit to a WebGPU canvas), image-scoped persistent
> resources (one source upload per image), one-render-in-flight coalescing
> (`renderPending` + `onSubmittedWorkDone`), and the WGSL tweaks (vectorized
> sRGB, integer grain hash, 16×16 workgroups). The engine API changed:
> `render`/`GpuBackend` service are gone — `createRenderRequest` (pure) +
> frontend-owned `GpuBackend` with `execute`/`snapshot` replace them.

### Phase A — Measure (small, do first)

- Dev-only timing overlay (or `performance.now()` logs): per-render `execute()`
  time, renders/sec during a drag, main-thread stall time from `mapAsync`.
- Baseline numbers on a 12MP image; keep them to compare after each phase.

### Phase B — Kill the display readback (the big win)

- The center canvas becomes a **WebGPU canvas** (`getContext('webgpu')`,
  `configure({ alphaMode: 'opaque', size: imageSize })`). CSS transform
  pan/zoom keeps working unchanged.
- Backend gains a **blit render pipeline**: fullscreen triangle (positions from
  `vertex_index`, no vertex buffer), fragment does `textureSample` of the
  processed texture (free bilinear) → swapchain texture.
- `execute()` = compute pass into dstTex + blit pass dstTex → canvas texture in
  one encoder, one submit, **no readback, no CPU pixels, no 2D canvas**.
- Empty-chain display: stop special-casing it. `render()` currently fails with
  `EmptyChainError` on an empty chain, but `generateChainSource([])` already
  emits a passthrough compute shader. Allow empty chains through the render
  path; delete `PaintInitial`, `paintBitmap`, and the `ImageDecoded` empty-chain
  branch.
- **Export** keeps a readback path (PNG needs CPU pixels), but it runs only on
  the export button click — one-time cost. Drop `renderedBitmap` from the model
  in favor of a `hasRendered` flag; `ExportImage` triggers render + readback.

### Phase C — Persistent resources

- Upload `srcTex` once per image; keep it for the image's lifetime.
- Keep `dstTex` + blit resources per image size; recreate only on image change.
- Cache params/resolution buffers and the bind group alongside the existing
  pipeline cache (keyed by shader source; resolution buffer per image).
- A slider tick becomes: `writeBuffer(params)` + `writeBuffer(frame)` +
  1 compute dispatch + 1 blit dispatch + submit. Zero allocations, no sync.

### Phase D — Coalesce renders (fixes the visible lag)

- Model gains a `renderPending` flag. `renderNow` skips dispatch when a render
  is already in flight and just marks pending (revision still bumps).
- `RenderedFrame` handler: instead of dropping a stale result outright, if
  `stamp < model.revision` and a render is pending, re-dispatch with the
  **latest** chain+draft.
- Result: at most one render in flight, always converging on the newest slider
  value. `u_frame` = stamp still increments, so grain keeps animating.
- This bounds GPU queue depth to ~1–2 regardless of pointer event rate.

### Phase E — WGSL micro-optimizations

- **Vectorize sRGB conversion** (colorspace.ts): one `select` + one `pow` on
  `vec3<f32>` instead of three per-channel branches. Same math, lets the driver
  vectorize.
- **Replace the `sin()` grain hash** (grain.ts) with an integer hash (e.g.
  pcg/xorshift-derived) — no transcendentals. Keep the density weighting;
  A/B the noise character (it will change slightly).
- **`@workgroup_size(16, 16)`** (256 invocations) instead of `(8, 8)`; make it a
  named constant, measure on discrete vs integrated GPUs, pick the winner.
- Leave the uniform-alias lets, `u_resolution` uniform, and the single linear
  round trip as-is — negligible or inherent.

### Phase F — Verify & close

- Update `chain-source.test.ts` for the workgroup-size and empty-chain changes.
- Run `@lutra/engine` and `@lutra/frontend` test suites.
- Manual pass: drag a slider on a 12MP image; confirm no lag, low CPU during
  drag, export still correct.
- Update ADR `0001-compute-shader-pipeline.md` (display path = compute + blit)
  and context.md (pipeline, coalescing, persistent resources).

## 4. Risks / notes

- WebGPU canvas support tracks the existing device-acquisition gate; no new
  fallback surface.
- Blit `textureSample` gives free bilinear downscaling for zoom-out; zoom-in
  stays CSS-scaled (same as today's 2D canvas).
- `bytesPerRow` 256-alignment requirement only matters for the export readback
  now.
- happy-dom tests don't cover the backend; the backend stays unit-test-free, as
  today.
