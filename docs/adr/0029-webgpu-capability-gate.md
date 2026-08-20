# WebGPU capability gate (graceful no-WebGPU fallback)

Lutra grades entirely on the GPU through WebGPU. On the ~8% of browsers that
don't expose WebGPU (or expose it without an adapter), the app used to
hard-crash at boot: `GpuBackend`'s device acquisition did
`Effect.catchTag('GpuError', (cause) => Effect.die(cause))`, turning a
missing GPU into an unhandled defect. This record captures the decision to
replace that crash with a capability gate + a "WebGPU required" screen, and
to explicitly **defer** a CPU compute fallback.

**Status**: implemented (2026-09-09).

## Context

- WebGPU is the only rendering path (docs/adr/0001, 0002). There is no
  CPU/Canvas2D color-grading fallback and no plan to add one.
- ADR 0002 already committed to a *feature-detection gate and a fallback
  message* for the unsupported slice. This work fulfills that commitment.
- A hard `Effect.die` on a missing GPU is the worst possible UX for that
  slice: a blank crash instead of a usable app shell.

## Decisions

### D1 — Gate on a capability, never crash on absence

`navigator.gpu` presence + a `requestAdapter()` probe become a boot-time
capability (`WebGpuCapability` in `gpu/capability.ts`), carried on the root
`Model` (`webgpu` field). The root `view` returns a "WebGPU required" screen
— with remediation steps (recent Chrome/Edge/Safari 17+, Firefox
`dom.webgpu.enabled`, hardware acceleration, ask an admin) and the probe's
`reason` — whenever `model.webgpu.supported` is false. The editor is never
entered, so the GPU backend is never touched on a gated device.

### D2 — Make GPU device acquisition lazy

foldkit builds the `resources` Layer **eagerly** at boot
(`Layer.buildWithScope` on the runtime scope); a Layer build failure escapes
as a crash (the same class of failure we're removing). So `GpuBackendLive`
must build at boot *without* a GPU. Device acquisition moves out of the
Layer's build effect into a memoized `getGpu()` (`Ref<Option<GpuContext>>`)
that runs on first `execute`/`present`/`snapshot`. `acquireGpu` fails with a
typed `GpuError` (no `Effect.die`) when `requestAdapter`/`requestDevice`
miss. With the view gating entry, that path is only reachable on a device
that reported an adapter at boot, so the gated slice stays crash-free.

### D3 — CPU compute fallback is explicitly deferred

A CPU/WGSL-on-CPU grading fallback was considered and rejected:

- Benchmarked on the reference image: ~2.1 s for 12 MP (~0.5 fps), ~4.3 s for
  24 MP, scaling linearly with pixel count. Too slow to be a usable editor.
- WGSL has no browser-deployable CPU runtime. `wgsl_reflect` is a debug
  interpreter; `lavapipe`/`SwiftShader` are native-only. There is no
  in-browser way to execute the grading shaders on a CPU and stay
  offline/Web-first.
- The gate already covers the dominant case (no `navigator.gpu` at all). The
  rare "WebGPU present but no adapter" case degrades to a per-session
  `GpuError` (typed failure, not a defect) rather than a full-app crash.

## Consequences

- No-WebGPU devices get a clear remediation screen instead of a boot crash.
- `GpuBackend` no longer dies on a missing GPU; resource-layer construction
  is GPU-free at boot.
- A CPU grading fallback is **not** implemented (deferred, not rejected as a
  concept — revisit only if a viable in-browser CPU/WGSL path appears).
- The happy-dom tests never exercise the GPU backend; the gate is covered by
  passing `webGpuSupported` into `init` directly.
