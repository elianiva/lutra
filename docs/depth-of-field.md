# Depth of field (depth-based blur)

Status: **design phase** — two decisions made, the core algorithm decision
open, and a feasibility demo pending. Resume by reading this file, then
answering the open questions in order (each carries a recommendation).

## Goal

Mimic real lens depth of field: blur an image with a radius that varies per
pixel by scene depth, so the focal region stays sharp while nearer and farther
regions soften. The contrast is object-isolation blur (segment subject, blur
everything else uniformly) — depth-based blur keeps continuous variation and
gets edges like hair right.

Two pillars, both fully client-side (matches Lutra's Web-first, client-only,
WebGPU-only posture):

1. A depth map generated in the browser from the source image (no server).
2. A WGSL blur whose radius per pixel is driven by that depth map.

## Decisions made

### D1 — It is an adjustment layer named "Depth of field" (Q1)

The 12th **adjustment layer** type in the engine registry, inheriting the
existing chain semantics: draft → confirm, slider-driven, reorderable,
persisted as part of the **edit chain**, order matters (a DOF layer after a
LUT blurs the graded look). Not a tool, not a mode, not an export-time effect.

### D2 — Focal-plane model, not depth-intensity mapping (Q2)

Blur radius grows with distance **from a user-chosen focal plane** in both
directions: `radius = amount · |depth(uv) − focus|`. Not `radius = f(depth)`
directly (that would keep one depth extreme sharp forever — wrong for a scene
where a foreground branch at 1m intrudes while the subject is at 2m).

Two parameters, in the style of the existing toggled layers (White balance,
Vignette):

- **Focus distance** — where the focal plane sits in depth (ruler slider).
- **Blur amount** — max blur radius; `0` = no-op (pure passthrough, which is
  also the graceful state while the depth map is still computing).

`amount = 0` is a structural escape hatch: the layer renders as a no-op until
the depth map is ready, so the phase machine needs no new "waiting for depth"
state.

Glossary entry lives in `context.md` (**Depth of field**).

## Research: in-browser depth estimation (2026-08)

Cheap-to-run is a solved problem: inference runs locally, **$0 server cost**,
no privacy change. The standard choice:

**Model**: `onnx-community/depth-anything-v2-small` (Depth Anything V2,
small — the browser-ecosystem standard), run via Transformers.js:

| Variant | Size | Use |
|---|---|---|
| `model_fp16.onnx` | 49.6 MB | WebGPU path (`dtype: "fp16"`) |
| `model_quantized.onnx` | 27.3 MB | WASM fallback (CPU, slow) |

- Input is internally resized to 518×518 — a 4000px photo costs the same as a
  1000px one, and the output depth map is ~518px regardless of source size
  (bilinear-upsampled when sampled at full res — fine for driving blur).
- Output: **relative** (inverse) depth, closer = brighter. Not metric — fine
  for blur, irrelevant for focus-distance selection.
- Downloaded once, cached by the browser (Cache API/IndexedDB via
  Transformers.js).
- WebGPU browsers: Chrome 113+, Safari 18+, Firefox 141+. Lutra already
  requires WebGPU (compute shaders), so this adds **no new browser floor**.
- Run inference in a Web Worker; WASM fallback is functional but slow.

Code path:

```js
import { pipeline } from "@huggingface/transformers";
const estimator = await pipeline(
  "depth-estimation",
  "onnx-community/depth-anything-v2-small",
  { device: "webgpu", dtype: "fp16" }
);
const { depth } = await estimator(image); // RawImage + raw tensor
```

**Live demos to verify feasibility by hand:**
- https://huggingface.co/spaces/Xenova/webgpu-depth-anything-v2 (canonical)
- https://paulkinlan.github.io/web-ai-showcase/models/depth-anything/

**Pending verification (whoever resumes):** run the demos and record (a)
first-load download time (~50MB), (b) inference latency on the target machine
at 518px (expect ~0.3–2s desktop), (c) depth-edge quality around hair/leaves
(the accuracy bottleneck for the whole feature), (d) GPU memory pressure next
to Lutra's existing full-res ping-pong textures.

Alternatives considered: MiDaS/DPT-hybrid via ONNX Runtime Web (smaller,
weaker edges), Depth Anything V2 metric variants (unneeded), Depth Pro (too
heavy). Revisit only if DA2-small proves too heavy or too fuzzy.

## Open decision Q3 — the blur algorithm

The core question. Lutra's pipeline: one compute pass per layer, ping-pong
through linear rgba16float intermediates (2-slot ring), all passes at session
resolution, per-pass bindings 0–6 (`srcTex`, `dstTex`, `u_resolution`,
`u_frame`, `u_params`, `samp`, `lutTex`). A variable-radius blur breaks the
cheap fixed-radius tricks (separable blur can't vary radius per pixel).

All options share one new seam: depth map as a new texture binding (~binding
7, sampled via the existing binding-5 sampler), a `usesDepth` flag on
`ChainPass`, `RenderRequest` gaining a depth bitmap beside `srcBitmap`
(engine stays pure; frontend produces/upload/s the map), plus the
`needsDepth` BodySource flag. The linearize-pass logic already handles
sampling bodies.

### Option A — single-pass gather (recommended)

One pass like clarity but with N taps: per-pixel `r = amount · |depth −
focus|`, then N fixed Poisson-disc offsets scaled by `r`, gaussian-weighted,
jittered via `u_frame`. Depth sample + N color samples per pixel.

- **Footprint**: small — `types.ts` flag, one binding in `chain-source.ts`,
  one session texture + bind-group entry in `backend.ts`, registry entry.
  Zero change to the pass model, ping-pong, uniforms, or tests.
- **Cost**: 16 taps at 4K ≈ 1GB texture traffic ≈ 10–25ms/frame, paid on
  every slider tick (the render loop re-runs the whole chain per render —
  already true today). 1080p: ~1–5ms. Tap count can scale with radius.
- **Quality ceiling**: ~16px radius; sparse disc shows structure/banding at
  the cap; depth-edge fringing (background gathers reach across edges and
  smear foreground color) — acceptable for v1, mitigable later (per-tap depth
  rejection, doubles depth reads).
- **Ship time**: days.

### Option B1 — layered full-res blurs

DOF expands into a *pass group*: K separable blur passes at doubling radii
(4/8/16px), then a final mix pass blending sharp + K blurs by CoC.

- **Breaks two engine invariants**: one-layer-one-pass (assembler + backend
  ping-pong slot math + `chain-source.test.ts`/`render.test.ts`), and
  one-`srcTex`-per-pass (the mix pass needs K+1 inputs; the 2-slot ring can't
  hold intermediates until the mix).
- **Cost**: ~7 full-res passes per DOF layer — bandwidth-wise the *same
  ballpark* as A at 4K (pass count dominates); pays off only past A's radius
  cap.
- **Quality**: smooth gaussian chain, no disc structure, radius to ~20px.

### Option B2 — true mip pyramid

Downsample the pass input into one multi-mip texture (each level: fixed blur
+ halve), final pass samples at `LOD = log2(r)` with level lerp — 2 samples,
near-free at any radius, highest quality ceiling (the "mip pyramid" already
named in `context.md` as clarity's upgrade path).

- **Deepest cut**: per-pass resolution is a brand-new concept (today every
  pass dispatches at session resolution with one session-wide
  `u_resolution`); per-level textures/dispatches/uniforms; multi-mip storage
  textures sampled via full-view have browser quirks.
- **Artifacts**: wide-LOD footprints amplify depth-edge leakage — most in
  need of the depth-aware guard.

### Comparison

| | A. One-pass gather | B1. Layered blurs | B2. Mip pyramid |
|---|---|---|---|
| Engine surgery | None (new binding only) | Pass groups, multi-input, ring changes | + per-pass resolution, mip textures |
| Passes per DOF layer | 1 | ~7 | K+1 |
| Per-pixel cost @ 4K | 17 reads (~10–25ms) | ~7 passes (~10–25ms) | ~5 cheap passes (~5–10ms) |
| Radius ceiling | ~16px (soft) | ~20px | Unbounded |
| Wide-radius quality | Disc structure, banding | Smooth | Smooth, best |
| Edge artifacts | Fringing (accept v1) | Fringing | Worst leak (needs guard) |
| Time to ship | Days | A week+ | A week+ |

**Recommendation**: A for v1 — fits the "intentionally limited" philosophy,
needs no engine surgery, and depth-map quality (518px, upsampled) will be the
visual bottleneck first. B1/B2 are the documented upgrade path.

**Suggested cheap probe**: prototype A on a scratch branch with a *fake* depth
map (radial gradient uploaded as the depth texture) — an afternoon of work —
and judge banding/fringing against a real Depth Anything map from the demo
above. Visual judgment beats estimates.

## Open questions (in dependency order, each with a recommendation)

1. **Blur algorithm** — Q3 above. *Recommended: A.*
2. **Depth-map lifecycle** — compute on image load in a background Web Worker
   (kick off once, cache per image/session) so the draft is instant; if not
   ready when a DOF layer is created, `amount = 0` passthrough covers it.
   *Recommended: background precompute on load; never block the draft.*
3. **Persistence** — depth maps are derived data, deterministic from the
   source copy an **Edit** owns; do not store them in the **Edit store**
   (regenerate on open, ~1–2s local). Revisit only if latency on open hurts.
   *Recommended: not persisted.*
4. **Depth texture format** — the pipeline's RawImage is 8-bit grayscale;
   upload as `rgba8unorm` (like `srcTex`), sample `.r`. 256 depth levels is
   enough for focus selection. *Recommended: rgba8unorm, no conversion.*
5. **Model management** — CDN + browser cache (Transformers.js default) vs
   vendoring ~50MB. The LUT library precedent is vendored, but 50MB is a
   different class. *Recommended: CDN first, vendor only if offline-first
   becomes a requirement.*
6. **WASM fallback** — expose a degraded path (slow CPU inference) or hard-
   require WebGPU (the app already does for rendering)? *Recommended: hard
   WebGPU; WASM is ~10× slower and the app's floor is already WebGPU.*
7. **Focus-distance default** — where the slider starts. Options: middle of
   the depth range, or the depth of the largest smooth region (subject-ish).
   *Recommended: middle of the visible depth range; subject detection is a
   separate feature.*

## Codebase touchpoints

- `packages/engine/src/shaders/types.ts` — `BodySource.needsDepth`
- `packages/engine/src/shaders/chain-source.ts` — binding-7 declaration;
  pass-group support only if B
- `packages/engine/src/render.ts` — `RenderRequest` gains depth source
- `packages/engine/src/layers/registry.ts` + `schemas.ts` — 12th layer,
  `focus`/`amount` fields
- `packages/engine/src/shaders/bodies/depth-of-field.ts` — new body
- `packages/frontend/src/gpu/backend.ts` — session depth texture + bind
  entry; depth upload once per image
- Frontend: depth-estimation service (Web Worker, Transformers.js), wired
  into image load; the `depth-anything-v2-small` pipeline
- `context.md` — **Depth of field** entry already added (D1/D2); extend as
  further terms resolve (e.g. **Depth map**, **Focus distance**)
- Future ADR when Q3 lands: the pass-model change (or its absence) and the
  algorithm choice are a hard-to-reverse, trade-off-heavy call — see
  `docs/adr/` for format

## How to resume

1. Run the two demo links, record the four verification numbers above.
2. (Optional) prototype Option A with a fake depth map; judge visually.
3. Answer open questions 2–7 in order.
4. Land the ADR for the Q3 decision; implement; update `context.md`.
