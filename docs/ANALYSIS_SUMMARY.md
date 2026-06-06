# Image Processing Reference Survey: PhotonCamera + Film-Simulator → Lutra

Sources surveyed:
- `~/Repositories/PhotonCamera` (Android Camera2 + NDK C++ + Vulkan compute, RAW pipeline)
- `~/Repositories/Film-Simulator` (Kotlin Multiplatform + Skia/skiko + Compose, LUT film sim)

Target: Lutra (Expo SDK 56 + RN 0.85 + `@shopify/react-native-skia` + Reanimated 4, nested per-layer `RuntimeShader` pipeline).

## What each reference does

### Film-Simulator

Cross-platform image processor built on Skia (skiko). One big SkSL shader runs the **whole** pipeline in a single GPU dispatch:

```
source → LUT (3D, trilinear) → exposure → contrast → shadows/highlights
      → saturation → temperature → grain → chromatic aberration
```

Key design choices:

- **Tonal math in linear light.** Explicit sRGB↔linear round-trip around exposure, contrast, shadows/highlights, and saturation. Temperature and grain stay in sRGB. Contrast is anchored at perceptual mid-grey (`0.214` Rec.709 in linear), not sRGB `0.5` — keeps adjustments from crushing shadows or burning highlights.
- **Single dispatch shader.** All adjustments are one `RuntimeEffect`. Source read happens once regardless of how many adjustments are non-zero. `imageScale` uniform maps fragCoord (output pixel space) to source pixel space, so the same shader instance renders full-res export and downscaled preview.
- **Two quality modes for grain.**
  - `grainQuality=0` (preview): cheap per-pixel hash, one tap per channel. Lives at pixel Nyquist, reads as digital noise but is a few ALU ops per pixel — keeps slider drag smooth.
  - `grainQuality=1` (export): film-emulation stack. Per-channel FBM at different cell sizes (B largest, R smallest — matches real emulsion layer crystal sizes), density-weighted with a `sqrt(L*(1-L))` curve biased toward mid-shadows, then blended into the image. ~30-40x more expensive.
  - `grainSeed` uniform varies the pattern between previews and exports.
- **Preview vs export split.**
  - Preview: downscale to `PREVIEW_MAX_DIMENSION=960`, JPEG quality 80.
  - Export: full resolution, user-configurable quality, tile-based render (~32 tiles) with `yield()` between tiles so the main thread can update a progress bar.
- **LUT layer.** `.cube` file parsed on the CPU, packed as a 2D image (`lutSize` wide × `lutSize²` tall, RGBA8), bound as a child shader. Trilinear interpolation in the shader. `lutIntensity` is 0..2 (extrapolates past 1, amplifies subtle stocks). Mix is clamped back into displayable range.
- **Debounced preview loop.** Slider changes trigger a `MutableStateFlow<PreviewRequest>`; `debounce(25ms)` + `collectLatest` cancels stale renders. Caches the decoded source `Image` and packed LUT `Image` to avoid re-decode on every slider tick.
- **Format whitelist.** HEIC/HEIF and all RAW formats (DNG/CR2/NEF/ARW/RAF/PEF/SR2/RW2) are transcoded to JPEG first via the platform converter before entering the Skia pipeline — Skia can't decode these at full quality on its own, and BitmapFactory returns only the embedded thumbnail for RAW.

### PhotonCamera

Native Android camera with C++/Vulkan pipeline. Different domain (RAW → display), but two specific things are gold:

- **Transfer-curve-aware LUT processor** (`lut_processor.cpp`). Real camera RAW files come in V-Log / S-Log3 / F-Log2 / LogC4 / Apple Log / HLG / ACES_CCT. A LUT calibrated for sRGB looks wrong if you don't go `sRGB → linear → log → trilinear sample → inverse`. The processor has 9 transfer curves with proper forward/inverse functions, then resamples the LUT itself between sizes (17³ → 33³) on the CPU with OpenMP. Direct solve for "LUT doesn't look right because source is in wrong color space" complaints.
- **Halation.** Multi-pass GLSL: extract highlights → horizontal Gaussian blur → vertical Gaussian blur → composite with a warm red tint. The signature "filmic" glow around bright highlights that no LUT, no contrast curve, no saturation adjustment produces. Separate from grain (which is per-pixel density noise) and separate from bloom (which is the full-color blurred highlights themselves).

## Key insights vs Lutra

### 1. Lutra has no export

Without export, the edit chain is a toy. Film-Simulator's full UX loop is:

1. User picks image
2. Source bytes stashed in app cache
3. Slider changes trigger debounced (25ms) re-render at preview resolution (960px max, JPEG 80)
4. Export: full-resolution render with high-quality grain, tile-based progress
5. Save to gallery

Lutra's `Pipeline` is just a screen-resolution renderer. No offscreen surface, no encode, no save. The export path is the missing half of the product.

### 2. Lutra's tonal shaders are subtly wrong

All math happens in sRGB. That works for multiplicative gain (exposure) and simple lumamasks, but:

- Contrast anchored at sRGB `0.5` instead of perceptual `0.214` (linear Rec.709) crushes shadows and burns highlights.
- Saturation in sRGB has the wrong shape — it boosts mid-saturated colors more than fully-saturated ones, opposite of what feels right.
- Shadows/highlights lift in sRGB is non-physical — a "lift" of `+0.1` in sRGB shadows is a much bigger relative change than `+0.1` in linear.

Film-Simulator's pattern — linearize, do tonal math, delinearize — is the fix. Cost: a few `pow()` calls per pixel.

### 3. Latent shader bugs

- `clarityEffect` claims to do local contrast but actually just lifts midtones uniformly — effectively a duplicate of the shadows slider.
- `vignetteEffect` uses `smoothstep(size, size - 0.8, dist)` — reversed args (`low > high`), undefined behavior in GLSL, likely produces a hard step or no effect.
- `chromaticAberrationEffect` offset is `dist * amount * 0.01` in absolute pixel space — the visual amount changes with image size.

### 4. Two quality paths is non-negotiable for film-grade effects

Film-Simulator's grain has a preview path (1 hash tap, ~few ALU) and an export path (~30-40x cost, FBM + per-channel cell sizes + density curve + soft-light blend). Same shape applies to clarity, halation, anything spatial. Lutra's "one path, one quality" model can't ship film-quality output without dropping slider FPS to ~15.

### 5. The LUT layer is the product

Film-Simulator exists to apply LUTs. The tonal adjustments are secondary. CONTEXT.md flags the LUT layer as "Future (not in v1)" but the Skia `RuntimeEffect` API supports `uniform shader lut` + `lut.eval(coord)` natively — implementation is just `.cube` parsing + 2D packing + a new shader pass. The interesting question is whether the product wants to be a LUT app or a tonal adjustment app; right now Lutra is the latter, Film-Simulator is the former.

### 6. HEIC/RAW will silently break

`expo-image-picker` will hand back a HEIC URI on iOS; `useImage` from `@shopify/react-native-skia` may fail to decode or return a tiny embedded thumbnail. Film-Simulator's whitelist of formats-needing-transcoding is the fix — either reject at the picker or transcode first.

### 7. The nested-shader pipeline is fine, with limits

ADR 0001's nested approach gives you "free" layers (inactive ones cost nothing), each layer is its own Skia `RuntimeShader`. Trade-offs:

- **Pros**: only active layers run, dead layers cost nothing, each layer is independently testable, the type system keeps the contract honest.
- **Cons**: 9 sequential texture reads/writes for 9 active layers, no cross-layer optimization, no shared linearization state, limited ability to use child shaders as LUT inputs, and a Skia `RuntimeShader` lacks full-SkSL features like mipmap-based local mean (`image.eval(coord, lod)`) which is what real clarity needs.

For the current chain length (typically 2-5 active layers) the nested approach is fine performance-wise. The real cost is qualitative: no way to give the user "what you'll see at export" without also shipping a single-dispatch preview shader.

### 8. Halation is a missing signature

PhotonCamera's multi-pass bloom-with-red-tint is the thing that makes highlights look "filmic" rather than "graded digital". No adjustment primitive, no LUT, no contrast curve produces it. Could be a 9th or 10th adjustment layer — single-pass approximation possible in a Skia runtime shader (do all 3 passes inline with `image.eval()` taps, accept the cost), or two-pass with a `Surface` ping-pong if quality matters.

### 9. Preview at fixed resolution ≠ preview at screen resolution

Film-Simulator downsamples source to 960px regardless of source size, which decouples preview FPS from source resolution. Lutra renders at the on-screen fit of the source, so a 6000×4000 DNG pays the same GPU cost per frame as a 1080×1080 phone snap. With 9 chained runtime shaders the per-frame cost adds up.

## What to take to Lutra (prioritized)

### Tier 1 — must do, low risk

| # | Action | Why |
|---|---|---|
| 1 | Add export path: offscreen surface, encode to JPEG/PNG, save to gallery | App is currently a demo without it |
| 2 | sRGB↔linear round-trip in exposure/contrast/shadows/saturation | Single biggest visual quality win |
| 3 | Fix the three shader bugs (clarity, vignette, CA) | Latent quality bugs in shipped code |
| 4 | "Show original" toggle for compare | Film-Simulator has it; standard for color work |
| 5 | HEIC/RAW format guard at picker | Will silently fail otherwise |

### Tier 2 — high value, moderate effort

| # | Action | Why |
|---|---|---|
| 6 | LUT layer (`.cube` parser + 2D-packed texture + trilinear shader) | The product, per Film-Simulator |
| 7 | High-quality grain path for export only | Preview stays cheap, export looks real |
| 8 | Real clarity (4-8 tap local mean, no mip) | Current is a duplicate of shadows |

### Tier 3 — interesting, not necessary

| # | Action | Why |
|---|---|---|
| 9 | Halation layer | Unique filmic signal |
| 10 | Preview-resolution clamping (decouple from source size) | Big images stop tanking FPS |
| 11 | Single-dispatch preview shader (Film-Simulator model) | Honest "what you'll see" preview |

## Open questions

1. **Export format**: JPEG only, or JPEG + PNG + "original format" (Film-Simulator has all three)? PNG preserves quality but triples file size; "original format" needs format-specific encoders per platform.
2. **LUT source**: CONTEXT.md says "download at runtime, not bundled" — what's the source? Custom API? A list of public free LUT packs? Self-hosted? This drives the whole data layer (download manager, cache, library UI) for the LUT layer.
3. **LUT intensity model**: 0..100% with no extrapolation (safer, predictable), or 0..200% with extrapolation past 1 (Film-Simulator's choice, amplifies subtle stocks)? Same question for "no LUT at all in v1" vs "ship a tiny built-in starter pack" — the latter makes the feature feel complete from day one.
4. **Export path runtime**: full-res render in JS thread (will jank on 24MP sources), RN worker thread (complicates Skia surface ownership), or a separate native module that owns the full-resolution render? Skia can render to an offscreen surface in JS but a 24MP render in one draw call is ~50-200ms.
5. **Preview size policy**: keep rendering at screen-fit, or downsample source to a fixed preview resolution (Film-Simulator's 960px max) and only render full-res for export? Latter is more honest (preview always matches export pipeline shape, just at lower res) but breaks zoom/pan UX since the user can't inspect source detail in the editor.
6. **Halation scope**: ship as a standalone layer (simple, composable), or fold into the grain layer (one "film texture" primitive)? PhotonCamera's halation is distinct from grain — separate layers is the cleaner model but adds a 10th layer type.
7. **Are we still greenfielding the LUT layer, or is the choice to leave it out of v1 final?** CONTEXT.md says "Future (not in v1)" but Film-Simulator is the only direct analog in the references. If we're "taking their image processing idea", the LUT is the headline feature. If we're not, what are we actually taking from Film-Simulator — the linear-light tonal math and two-path grain?
8. **Pipeline shape long-term**: keep nested per-layer `RuntimeShader`s, or migrate to a single-dispatch shader that takes all active layer params as uniforms? The nested form is type-safe and pays nothing for absent layers, but caps us at the "one pass per active layer" cost and limits spatial effects. The single-dispatch form is one GPU call regardless of layer count and unlocks cross-layer optimization, but loses the "only active layers run" property and requires every new layer to be a shader branch. This is an architectural decision worth making before Tier 2 work.
