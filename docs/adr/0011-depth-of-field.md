# Depth of field

**Status**: decided (focal-plane model, layer shape); the blur pass model has a recommendation but is not final. **Not yet implemented.**

Mimic real lens depth of field: blur radius varies per pixel by scene depth, so the focal region stays sharp while nearer and farther regions soften — continuous variation, with edges like hair handled by depth, not object-isolation masking. Fully client-side (WebGPU compute + in-browser depth estimation), matching the app's posture.

## Decisions

### It is an adjustment layer named "Depth of field"

An adjustment layer in the engine registry inheriting the existing chain semantics: draft → confirm, slider-driven, reorderable, persisted in the edit chain, order matters (a DOF layer after a LUT blurs the graded look). Not a tool, not a mode, not an export-time effect.

### Focal-plane model, not depth-intensity mapping

Blur radius grows with distance **from a user-chosen focal plane** in both directions: `radius = amount · |depth(uv) − focus|`. Not `radius = f(depth)` — that would keep one depth extreme sharp forever, wrong when a foreground branch intrudes while the subject is farther. Two parameters, in the toggled-layers style (White balance, Vignette): **focus distance** (ruler slider) and **blur amount** (max radius; `0` = no-op passthrough — the graceful state while the depth map computes, so the phase machine needs no new "waiting for depth" state).

## In-browser depth estimation

Model: `onnx-community/depth-anything-v2-small` (Depth Anything V2 small — the browser standard) via Transformers.js: `model_fp16.onnx` 49.6 MB (WebGPU path) / `model_quantized.onnx` 27.3 MB (WASM fallback). Input is internally resized to 518×518 (a 4000px photo costs the same as a 1000px one); output is relative inverse depth (closer = brighter), sufficient for driving blur. Downloads once, cached by the browser; runs in a Web Worker. No new browser floor — WebGPU browsers only, which the app already requires. MiDaS/DPT-hybrid (weaker edges), metric variants (unneeded), and Depth Pro (too heavy) were rejected. Verify before building: first-load time, inference latency (~0.3–2s desktop expected), depth-edge quality around hair/leaves (the accuracy bottleneck), GPU memory pressure next to full-res ping-pong textures.

## Open decisions (with recommendations)

- **Blur pass model** — variable-radius blur breaks separable/fixed-radius tricks. Recommendation: **one-pass gather** for v1 (new depth-texture binding + `usesDepth` flag only, ~16px soft radius ceiling, some depth-edge fringing); layered blurs or a mip pyramid are the documented upgrade path when quality demands it. Cheap probe first: prototype with a fake radial-gradient depth map and judge banding/fringing visually.
- **Depth-map lifecycle** — compute on image load in a background worker, cached per session; never block the draft (`amount = 0` covers the gap).
- **Persistence** — depth maps are deterministic from the source; do not store them (regenerate on open).
- **Depth texture format** — upload as `rgba8unorm`, sample `.r`; 256 levels suffice for focus selection.
- **Model delivery** — CDN first (browser-cached); vendor only if offline-first demands it. Vendoring ~50MB is a different class than the LUT library precedent.
- **No WASM fallback** — hard-require WebGPU (the app's floor already is; WASM inference is ~10× slower).
- **Focus-distance default** — middle of the visible depth range; subject detection is a separate feature.

The blur pass model is the hard-to-reverse, trade-off-heavy call: when it lands, this ADR is extended with the final decision.
