# Depth of field: a focal-plane depth blur adjustment layer

Mimic real lens depth of field: blur radius varies per pixel by scene depth,
so the focal region stays sharp while nearer and farther regions soften —
continuous variation, with edges like hair handled by depth, not by
object-isolation masking. Fully client-side (WebGPU + in-browser depth
estimation), matching the app's posture.

**Status**: design phase — D1/D2 decided (2026-08); the blur algorithm (Q3)
is open with a recommendation. Not implemented.

## Decisions

### D1 — It is an adjustment layer named "Depth of field"

The 12th **adjustment layer** in the engine registry, inheriting the existing
chain semantics: draft → confirm, slider-driven, reorderable, persisted in
the **edit chain**, order matters (a DOF layer after a LUT blurs the graded
look). Not a tool, not a mode, not an export-time effect.

### D2 — Focal-plane model, not depth-intensity mapping

Blur radius grows with distance **from a user-chosen focal plane** in both
directions: `radius = amount · |depth(uv) − focus|`. Not `radius = f(depth)`
(that would keep one depth extreme sharp forever — wrong when a foreground
branch intrudes while the subject is farther). Two parameters, in the style
of the toggled layers (White balance, Vignette): **focus distance** (ruler
slider) and **blur amount** (max radius; `0` = no-op passthrough — the
graceful state while the depth map computes, so the phase machine needs no
new "waiting for depth" state).

## Research summary (in-browser depth estimation)

**Model**: `onnx-community/depth-anything-v2-small` (Depth Anything V2,
small — the browser standard) via Transformers.js. `model_fp16.onnx` 49.6 MB
(WebGPU path), `model_quantized.onnx` 27.3 MB (WASM fallback). Input is
internally resized to 518×518 (a 4000px photo costs the same as a 1000px
one); output is relative inverse depth (closer = brighter), fine for driving
blur. Downloads once, cached by the browser. WebGPU browsers only (Chrome
113+, Safari 18+, Firefox 141+) — no new browser floor, since the app already
requires WebGPU. Run in a Web Worker. Feasibility demos:
`huggingface.co/spaces/Xenova/webgpu-depth-anything-v2` and
`paulkinlan.github.io/web-ai-showcase/models/depth-anything/` — verify
first-load time (~50MB), 518px inference latency (expect ~0.3–2s desktop),
depth-edge quality around hair/leaves (the accuracy bottleneck), and GPU
memory pressure next to the full-res ping-pong textures. Alternatives
considered and rejected: MiDaS/DPT-hybrid (weaker edges), Depth Anything V2
metric variants (unneeded), Depth Pro (too heavy).

## Open decision Q3 — the blur algorithm

Lutra's pipeline: one compute pass per layer, ping-pong through linear
rgba16float intermediates, all passes at session resolution. A variable-radius
blur breaks the cheap fixed-radius tricks (separable blurs can't vary radius
per pixel). All options share one new seam: a depth texture binding (~7,
sampled via the existing binding-5 sampler), a `usesDepth` flag on
`ChainPass`, `RenderRequest` gaining a depth source, and a `needsDepth`
`BodySource` flag.

| | A. One-pass gather | B1. Layered blurs | B2. Mip pyramid |
|---|---|---|---|
| Engine surgery | None (new binding only) | Pass groups, multi-input, ring changes | + per-pass resolution, mip textures |
| Passes per DOF layer | 1 | ~7 | K+1 |
| Radius ceiling | ~16px (soft) | ~20px | Unbounded |
| Quality | Disc structure/banding at cap; depth-edge fringing | Smooth gaussian | Best, but worst edge leakage (needs guard) |
| Time to ship | Days | A week+ | A week+ |

**Recommendation: A for v1** — fits the "intentionally limited" philosophy,
needs no engine surgery, and depth-map quality (518px, upsampled) will be the
visual bottleneck first. B1/B2 are the documented upgrade path. Cheap probe:
prototype A with a *fake* depth map (radial gradient uploaded as the depth
texture) and judge banding/fringing visually.

## Open questions (each with a recommendation)

1. **Depth-map lifecycle** — compute on image load in a background Web
   Worker, cached per image/session; `amount = 0` covers the not-ready gap.
   *Recommended: background precompute on load; never block the draft.*
2. **Persistence** — depth maps are deterministic from the Edit's source
   copy; do not store them (regenerate on open, ~1–2s local). *Recommended:
   not persisted.*
3. **Depth texture format** — upload as `rgba8unorm`, sample `.r` (256
   levels is enough for focus selection). *Recommended.*
4. **Model management** — CDN + browser cache vs vendoring ~50MB (the LUT
   library precedent is vendored, but 50MB is a different class).
   *Recommended: CDN first; vendor only if offline-first demands it.*
5. **WASM fallback** — hard-require WebGPU (the app's floor already is).
   *Recommended: hard WebGPU; WASM is ~10× slower.*
6. **Focus-distance default** — middle of the visible depth range.
   *Recommended; subject detection is a separate feature.*

## Consequences

- Glossary entry in `context.md` (**Depth of field**) landed with D1/D2;
  extend as further terms resolve (e.g. **Depth map**, **Focus distance**).
- When Q3 lands, the ADR is extended with the pass-model decision — it's a
  hard-to-reverse, trade-off-heavy call.
