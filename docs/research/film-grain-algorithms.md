# Film Grain Algorithms Research

> Research artifact — not a plan. Exploring algorithms that produce film-like grain, focusing on luminance-dependent, physically-motivated approaches rather than simple noise overlays.

## Why Simple Noise Fails

Adding Gaussian or Poisson noise to an image doesn't look like film grain. Real film grain has:

- **Varying shapes and sizes** — silver halide crystals are irregular polygons (cubes, octahedra, tabular grains), not square pixels
- **Spatial correlation** — crystals cluster organically; grain isn't independent per-pixel
- **Luminance dependence** — grain intensity and character changes across the tonal range
- **Multi-scale structure** — fine crystals group into larger visible clumps
- **Color variation** — subtle warm/cool shifts in R and B channels, independent of luma
- **Volume/depth** — emulsion is a 3D stack of crystal layers, not a flat overlay

Simply multiplying a noise texture on top of an image produces "digital noise" — harsh, uniform, and visibly artificial. Film grain _is_ the image; it's not overlaid on it.

---

## Tier 1: Physically-Based Simulation (Gold Standard)

### Newson et al. — Stochastic Film Grain Model (2017)

**Paper:** "A Stochastic Film Grain Model for Resolution-Independent Rendering"  
**Sources:** [IPOL](https://www.ipol.im/pub/art/2017/192/article_lr.pdf), [CGF](https://hal.science/hal-01520260v1/file/Film_grain_synthesis_computer_graphics_forum.pdf)  
**Reference implementations:** [alasdairnewson/film_grain_rendering](https://github.com/alasdairnewson/film_grain_rendering) (C++), [kjerk/silvergrain](https://github.com/kjerk/silvergrain) (Python, GPU-accelerated), [darktable/Ansel](https://ansel.photos/en/doc/views/darkroom/modules/photographic-grain/) (production C/OpenCL)

**Core idea:** Model grain as a stochastic geometric process based on actual silver halide crystal physics, not as additive noise.

**Algorithm (simplified):**

1. Place binary grain "seeds" at sub-pixel level using a Poisson point process
2. Each seed grows into a crystal shape (polyhedron projected to 2D) with random size/orientation
3. Multiple crystal layers are stacked vertically (simulating emulsion depth)
4. Each crystal captures a flat tone averaged over its footprint from the remaining light
5. Detail finer than grain size is _not preserved_ inside the grain (this is key!)
6. Final image reconstructed by filtering the binary grain field
7. Output/input resolution are independent — grain scales cleanly to any size

**Key parameters:**

- `filling` — surface filling ratio of crystals per layer (real film: 15-30%)
- `size` — average grain size in pixels (linked to film ISO)
- `n` — number of crystal layers (real film: 20-60 for non-tabular, up to 125 for tabular)
- `std` — standard deviation of log-normal grain size distribution

**Why it's good:**  
Resolution-independent, physically grounded, produces emergent S-curve (Hurter-Driffield) response from pure statistics — the characteristic film tone curve emerges from the crystal math without being programmed in. Users can tweak parameters that map to real film properties.

**Tradeoff:** Full Monte Carlo version is slow. Optimized versions (Ansel, silvergrain with CUDA) achieve near-real-time.

---

### Aurélien Pierre — Crystallographic Structure Simulation (2023)

**Article:** [Stochastic photographic grain synthesis from crystallographic structure simulation](https://eng.aurelienpierre.com/2023/07/stochastic-photographic-grain-synthesis-from-crystallographic-structure-simulation/)  
**Production code:** [Ansel `src/iop/crystgrain.c`](https://ansel.photos/) (C + OpenCL)

**Core idea:** Extension of Newson but with explicit crystal shape modeling using polar equations for polyhedra. Each layer gets one crystal shape; seeds are grown via 2D convolution with a non-normalized kernel.

**Key innovations over base Newson:**

- Crystal shapes generated from polar equations: `r(θ,φ,n)` for n-vertex polygons
- Seed density computed exactly via Boolean model: `s = 1 - (1-f)^(1/A)`
- Exposure compensation via mean-field analytical prediction (not measured — critical for tiled pipelines)
- "Remaining light field" — each crystal depletes light for layers below it
- Alpha printing model for highlight protection

**RGB extensions (from production Ansel code):**

- **Depth-ordered spectral sub-stacks** — layers partitioned into B/G/R in depth order (like real color film)
- **Inter-channel correlation** — per-pixel probability (default 67%) of shared vs independent crystal births across channels
- **Chromatic amplitude control** — scales the chromatic excursion of grain without weakening the grain itself

**Crystal shape generation:**

```python
# Polar equation for regular polyhedron border
r(θ, φ, n) = cos(π/n) / cos((2·arcsin(cos(n·(θ+φ))) + π) / (2n))
```

Where `n` = number of vertices (3-10), `φ` = rotation angle. For n=6 (octahedron), this produces hexagonal-ish shapes typical of real AgX crystals.

---

## Tier 2: Luminance-Weighted Perceptual Models

### cinegrain — Asymmetric Luminance Curve + Multi-Scale Value Noise

**Source:** [mr-berndt/cinegrain](https://github.com/mr-berndt/cinegrain) (GLSL shader for mpv)  
**Status:** Production-quality, calibrated against real film scans

**Core idea:** Not a physical simulation, but an extremely well-tuned perceptual model that produces visually authentic results in real-time GLSL.

**Luminance curve (the key formula):**

```glsl
float luma_weight(float luma) {
    float r = (luma > PEAK) ? ROLLOFF * 0.35 : ROLLOFF;
    float d = (luma - PEAK) / r;
    float bell = exp(-0.5 * d * d);
    float shadow = min(pow(luma / max(PEAK, 0.001), 0.18), 1.0)
                 * smoothstep(0.0, 0.03, luma);
    return bell * shadow;
}
```

**How it works:**

- **Highlights:** Tight Gaussian rolloff (35% of ROLLOFF width) — grain disappears quickly above peak
- **Midtones:** Peak grain at configurable PEAK luminance (default 0.40)
- **Shadows:** Power law ramp (γ=0.18) with smoothstep cutoff below 3% luma — prevents black-level lift
- Validated against real film reference scans and AV1 film grain synthesis paper

**Grain generation:**

- Multi-scale value noise (fine + coarse layers mixed by COARSE_MIX)
- Quintic smoothstep interpolation (C² continuous — no visible grid edges)
- Optional spatial blur (5-tap cross pattern) for projection-magnification softness
- Separate color grain at 1.8× grain scale (chroma is coarser on real film)

**Parameters:**

| Param        | What it maps to                                           |
| ------------ | --------------------------------------------------------- |
| `PEAK`       | Luminance where grain peaks (film stock dependent)        |
| `ROLLOFF`    | Bell curve width (wider = grain over broader tonal range) |
| `GRAIN_SIZE` | Gate size × film speed                                    |
| `COARSE_MIX` | Crystal clustering ratio                                  |
| `CHROMA`     | Dye density color variation                               |
| `SOFTNESS`   | Optical softening from projection magnification           |

**Why it's relevant:**  
This is the most practical reference for a real-time application. The luminance curve is the single most important piece — it's what makes grain feel "right" versus noise-on-top-of-image. The formula is simple, fast, and validated.

---

### Dehancer — 3D Volumetric Grain Model

**Source:** [Dehancer blog](https://blog.dehancer.com/articles/how-does-film-grain-work-in-dehancer-ofx-plugin/) (proprietary, but well-documented)

**Core idea:** Procedural 3D grain where crystals are volumetric particles with rotation, depth, shadow casting, and refraction through emulsion layers.

**Key properties modeled:**

- Grain isn't overlaid — image _consists_ of grain (detail depends on grain size)
- Silver halides have volume, are rotated relative to film plane, cast shadows
- Multiple grain shapes: rounded and flat ("T-grain")
- Clustering: tiny grains form conglomerations, don't exist alone
- Highlights always have grain (Dmax = maximum silver accumulation)
- Shadows always have grain (Dmin = minimum exposure, but print media grain becomes visible)

**Grain types:**

- **Negative grain:** More pronounced in highlights, higher microcontrast
- **Positive grain:** Softer, less pronounced in highlights (classic positive film look)

**User controls:** Size, Amount, Film Resolution, Shadows/Midtones/Highlights distribution, Chroma

**Key insight:**  
Grain is generated based on _local color and brightness characteristics_ — it's always related to the image content, not independent of it. The grain pattern changes per-frame and per-pixel based on what it's "capturing."

---

## Tier 3: Simplified Approaches (Good Enough for Real-Time)

### Blue Noise Thresholding + Layering

**Source:** [Denis Pătruț's experiment](https://kanzwataru.xsrv.jp/articles/2025-07-04-grain-experiment-en.html), [kanzwataru/filmgrain-simplified](https://github.com/kanzwataru/filmgrain-simplified) (HLSL/SDL3)

**Core idea:** Instead of overlaying noise, _reconstruct_ the image as binary grain. Use blue noise texture, threshold by pixel brightness, stack multiple layers.

**Algorithm:**

1. Subdivide each pixel into grid (2×2 to 8×8)
2. Sample blue noise texture at sub-pixel level
3. Threshold noise value by pixel brightness: `step(noise, pixel_value * weight)`
4. Average sub-pixels back — binary grain becomes grayscale
5. Stack multiple noise layers with decreasing weight (simulating emulsion depth)
6. Final: `grain += step(noise_layer[i], value * weight[i])`

**Key properties:**

- Blue noise is equally-spaced (unlike white noise), giving natural clumping
- Per-channel noise with slight offsets prevents overly-random color
- "Base color" emulation (tinted blacks like negative film base)
- Binary grain → grayscale via spatial averaging = how real film actually works

**Tradeoff:** Simpler than full simulation, but less controllable. No explicit luminance curve — the thresholding does implicit luminance adaptation.

---

### AV1/AOMedia Film Grain Synthesis

**Source:** [AOMedia technical report](https://aomedia.org/docs/CWG-C051o_TR_AOMedia_film_grain_synthesis_technology_v2.pdf), [Netflix TechBlog](https://netflixtechblog.com/av1-scale-film-grain-synthesis-the-awakening-ee09cfdff40b)

**Core idea:** Industry standard for video codec grain. Grain is analyzed at encode time, parameters stored in metadata, synthesized at decode time. Uses an auto-regressive model.

**Key features:**

- Grain strength varies by luminance (scaling coefficients per luma level)
- Temporal independence (grain changes every frame)
- Spatial correlation via auto-regressive filtering
- Separate luma and chroma grain models
- Per-channel independent noise (like real film)

**Noise model:**

- Input image is denoised at encoder
- Grain parameters extracted from difference between original and denoised
- Decoder regenerates grain from parameters + random seed

**Relevance:** Not an algorithm to implement directly, but validates the luminance-dependent approach. Their Figure 5 shows the grain intensity curve across luminance that cinegrain's γ=0.18 power law matches.

---

## The Luminance Dependence — How It Actually Works

This is the part you were remembering. Film grain is **density-dependent** (which maps to brightness in the final image):

### Physical reality:

1. **Highlights (Dmax on negative):** Maximum silver halide accumulation. Lots of grain exists here, but it's _less visible_ to human perception because the bright background masks it. Grain is present but perceived as subtle texture.

2. **Midtones:** Grain is most visible here. Moderate crystal density, high perceptual contrast against the surrounding tones. This is where grain "peaks" perceptually.

3. **Shadows (Dmin on negative):** Minimum exposure, few activated crystals. But when printing, maximum light passes through the negative's clear areas, making the _print media's own grain_ visible. So shadows always have some grain too.

4. **Deep blacks:** Below ~3% luminance, grain should effectively disappear (smoothstep cutoff) to prevent lifting the black point.

### The curve:

```
Grain
intensity
  ^
  |         ╱‾‾‾‾╲
  |        ╱      ╲
  |       ╱        ╲
  |      ╱          ╲
  |     ╱            ╲
  |    ╱              ╲
  |___╱                ╲_______
  +---------------------------> Luminance
  0%    20%   40%   60%   80%  100%
       shadow  mid   highlight
```

- Asymmetric: sharper falloff on highlight side (Gaussian, narrow)
- Softer ramp on shadow side (power law γ≈0.18)
- Hard cutoff near true black (smoothstep at 3%)
- Peak around 35-40% luminance (depends on film stock)

### Implementation (from cinegrain, validated against scans):

```glsl
// Highlight side: tight Gaussian (35% of base rolloff)
// Shadow side: power law with smoothstep kill
float r = (luma > PEAK) ? ROLLOFF * 0.35 : ROLLOFF;
float bell = exp(-0.5 * ((luma - PEAK) / r)²);
float shadow = min(pow(luma / PEAK, 0.18), 1.0) * smoothstep(0.0, 0.03, luma);
return bell * shadow;
```

---

## Fuji's Approach (What You Were Thinking Of)

Fujifilm cameras have two separate things:

1. **Film Simulation modes** — These are primarily **LUTs** (color/contrast profiles) mapped to their classic film stocks (Provia, Velvia, Classic Chrome, Acros, etc.). These handle color grading, tone curves, and saturation. The "grain" option is secondary.

2. **Grain Effect** — Available on X-Trans III/IV+ cameras. Settings: Off/Weak/Strong (some models have Weak/Strong size options too). The Acros B&W simulation has built-in grain that increases with ISO.

### What we actually know (vs speculation)

**Observed behavior (Fuji X Weekly):**

- Grain effect is very subtle — barely noticeable even at Strong without close pixel-level inspection
- Acros simulation grain increases with ISO (suggesting at least ISO-awareness, not a static overlay)
- The X-Pro3 introduced additional grain size controls not on older models

**Fuji patent** ([5065256](https://www.freepatentsonline.com/5065256.html)):

- Describes generating grain using **M-sequence coding theory** with a random number generator and digital comparator
- This sounds more like **procedural generation** than a static texture lookup
- The patent is from 1991 (for film-era printing tech), so it may not directly describe the digital camera implementation

**What we DON'T know:**

- The actual implementation in modern X-Trans cameras is undocumented
- Whether grain adapts to local luminance/content is unclear from public sources
- One blogger (Denis Pătruț) speculated it might be a multiplied texture overlay, but this is explicitly labeled as suspicion, not confirmed

**What makes Fuji grain look good regardless of implementation:**

- The Film Simulation LUTs do the heavy lifting for the "film look"
- Applied at the right stage in the pipeline (before JPEG compression)
- Combined with other film-like processing (highlight rolloff, color shifts)
- Even a simple grain done subtly and with good color science reads as "film-like"

The _real_ magic of Fuji's film simulations is the color science, not the grain. The grain just adds texture. For a truly film-like result, you need both.

---

## Recommendation for Lutra

Based on this research, the algorithm stack should be:

### Primary: Luminance-Weighted Multi-Scale Grain

The cinegrain approach is the best balance of quality, performance, and controllability:

1. **Asymmetric luminance curve** (bell × shadow ramp × smoothstep) — this is the most important single piece
2. **Multi-scale value noise** (fine + coarse layers with quintic interpolation) — gives organic texture
3. **Spatial correlation** (blur kernel scaled to grain size) — prevents pixel-noise look
4. **Separate color grain** at larger scale — subtle R/B shifts at 1.5-1.8× luma grain size

### Optional enhancement: Crystal simulation

For a "premium" mode, layer in elements of the Newson/Pierre model:

- Binary thresholding with polyhedral kernels
- Multiple layers with remaining-light depletion
- Inter-channel correlation control

### Key parameters to expose:

| Parameter          | Description               | Default |
| ------------------ | ------------------------- | ------- |
| `intensity`        | Overall grain strength    | 0.1     |
| `grainSize`        | Base grain size in pixels | 1.0     |
| `luminancePeak`    | Where grain peaks (0-1)   | 0.38    |
| `luminanceRolloff` | Bell curve width          | 0.40    |
| `coarseMix`        | Multi-scale clustering    | 0.40    |
| `chroma`           | Color grain strength      | 0.20    |
| `softness`         | Optical softening         | 0.0     |

### Sources to reference during implementation:

1. **cinegrain GLSL** — `mr-berndt/cinegrain/shader/cinegrain.glsl` — production-quality luminance curve + value noise
2. **Newson et al. 2017** — The foundational paper for physically-based grain
3. **Aurélien Pierre 2023** — Crystallographic model with production pipeline insights (tiled rendering, deterministic RNG, scene-referred)
4. **AV1 spec** — Validates luminance curve shape (γ=0.18 for shadows)
5. **Dehancer blog** — Documents the physical properties to model (volumetric crystals, clustering, Dmax/Dmin behavior)

---

## Implementation Changes (applied)

### What changed

| Aspect                 | Before                                                    | After                                                                                                       |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Luminance curve**    | Symmetric triangle `w = max(1 -                           | L-0.5                                                                                                       | × 1.4, 0.35)` | Asymmetric: Gaussian highlights (35% rolloff) + power-law shadows (γ=0.18) + smoothstep at 3% |
| **Noise structure**    | 3-octave FBM, same noise for all channels                 | Multi-scale: fine + coarse (0.67× freq) value noise layers                                                  |
| **Color grain**        | None (monochrome, same noise added to RGB)                | Separate R/B noise at 1.8× grain size (chroma grain is coarser on real film)                                |
| **Parameters**         | `texture` (strength), `size` (cell), `blur` (persistence) | `amount` (strength), `profile` (0–4 film stock preset), `size` (override), `chroma` (color grain)           |
| **Film stock presets** | None                                                      | 5 profiles: Subtle, Medium, Heavy, Vintage, Cinematic — each sets grain size, luminance peak, rolloff, blur |

### Key formula (luminance weight)

```wgsl
// Highlight side: tight Gaussian (35% of base rolloff)
// Shadow side: power law γ=0.18 with smoothstep cutoff at 3% luma
let r = select(rolloff, rolloff * 0.35, luma > peak);
let bell = exp(-0.5 * ((luma - peak) / r)²);
let shadow = min(pow(luma / peak, 0.18), 1.0) * smoothstep(0.0, 0.03, luma);
return bell * shadow;
```

This is validated against real film scans (cinegrain) and the AV1 grain synthesis spec (Figure 5).

### Profile defaults

| Profile   | Grain Size | Peak | Rolloff | Blur |
| --------- | ---------- | ---- | ------- | ---- |
| Subtle    | 0.30       | 0.40 | 0.35    | 0.60 |
| Medium    | 0.50       | 0.38 | 0.40    | 0.55 |
| Heavy     | 0.70       | 0.35 | 0.50    | 0.45 |
| Vintage   | 0.80       | 0.42 | 0.55    | 0.35 |
| Cinematic | 1.00       | 0.36 | 0.45    | 0.40 |

### Files changed

- `packages/engine/src/shaders/bodies/grain.ts` — New WGSL shader (luminance curve, multi-scale noise, chromatic grain, profile lookup)
- `packages/engine/src/layers/schemas.ts` — GrainLayer fields: amount/profile/size/chroma
- `packages/engine/src/layers/registry.ts` — FIELD_META.grain updated
- `packages/frontend/src/editor/layer-meta.ts` — UI labels, formatters, GRAIN_PROFILES constant
- `packages/engine/src/shaders/chain-source.test.ts` — Updated field keys in test fixtures
- `packages/engine/src/layers/defaults.test.ts` — Updated default values

### What's NOT implemented (future work)

- **Crystal simulation** (Newson/Pierre model) — binary thresholding with polyhedral kernels, remaining-light depletion. Would be a "premium" mode.
- **Per-frame temporal decorrelation beyond hash seeding** — real film grain changes every frame; our hash-seeded approach achieves this but doesn't model inter-frame correlation.
- **Resolution-dependent grain scaling** — grain size is in pixel units, not physical units. ADR-0004 notes this.

---

## References

### Papers & Technical Reports

- Newson et al. (2017) — _A Stochastic Film Grain Model for Resolution-Independent Rendering_ — [PDF](https://hal.science/hal-01520260v1/file/Film_grain_synthesis_computer_graphics_forum.pdf)
- Newson et al. (2017) — _Realistic Film Grain Rendering_ (IPOL) — [PDF](https://www.ipol.im/pub/art/2017/192/article_lr.pdf)
- Aurélien Pierre (2023) — _Stochastic photographic grain synthesis from crystallographic structure simulation_ — [Article](https://eng.aurelienpierre.com/2023/07/stochastic-photographic-grain-synthesis-from-crystallographic-structure-simulation/)
- Stephenson & Saunders (2007) — _Simulating Film Grain using the Noise-Power Spectrum_ — [PDF](https://eprints.bournemouth.ac.uk/10547/1/grain.pdf)
- AOMedia — _Technical report on AOMedia film grain synthesis technology_ — [PDF](https://aomedia.org/docs/CWG-C051o_TR_AOMedia_film_grain_synthesis_technology_v2.pdf)
- Netflix (2024) — _AV1 @ Scale: Film Grain Synthesis, The Awakening_ — [Blog](https://netflixtechblog.com/av1-scale-film-grain-synthesis-the-awakening-ee09cfdff40b)
- IEEE (2018) — _Film Grain Synthesis for AV1 Video Codec_ — [IEEE Xplore](https://ieeexplore.ieee.org/document/8416572/)
- Brown CS (2007) — _Bayesian de-graining with inhomogeneous beta noise model_ — [Report](https://cs.brown.edu/research/pubs/techreports/reports/CS-07-03.html)
- IET — _Signal-dependent film grain noise generation using homomorphic adaptive filtering_ — [Digital Library](https://digital-library.theiet.org/content/journals/10.1049/ip-vis_20000212)

### Implementations & Source Code

- [alasdairnewson/film_grain_rendering](https://github.com/alasdairnewson/film_grain_rendering) — C++ reference implementation of Newson et al.
- [kjerk/silvergrain](https://github.com/kjerk/silvergrain) — Python + CUDA GPU-accelerated version
- [mr-berndt/cinegrain](https://github.com/mr-berndt/cinegrain) — GLSL film grain shader for mpv (luminance-weighted, multi-scale)
- [Ansel Photographic Grain Module](https://ansel.photos/en/doc/views/darkroom/modules/photographic-grain/) — Production C/OpenCL implementation of crystallographic grain
- [kanzwataru/filmgrain-simplified](https://github.com/kanzwataru/filmgrain-simplified) — Blue noise thresholding approach (HLSL/SDL3)
- [noizuy/adptvgrnMod](https://github.com/noizuy/adptvgrnMod) — Vapoursynth adaptive grain with luma scaling
- [InterDigitalInc/VersatileFilmGrain](https://github.com/InterDigitalInc/VersatileFilmGrain) — VVC/AV1 film grain synthesis implementation

### Blog Posts & Articles

- Dehancer — _How does film grain work in Dehancer OFX plugin_ — [Blog](https://blog.dehancer.com/articles/how-does-film-grain-work-in-dehancer-ofx-plugin/)
- Denis Pătruț (2025) — _Simple Physically-Based Film Grain Simulation: An Experiment_ — [Article](https://kanzwataru.xsrv.jp/articles/2025-07-04-grain-experiment-en.html)
- FilmMatch — _Advanced grain profiling and compositing_ — [Blog](https://www.film-match.com/blog/advanced-grain-profiling-and-compositing)
- PetaPixel (2022) — _Why Adding 'Film Grain' to Digital Photos is Trickier Than You May Think_ — [Article](https://petapixel.com/2022/11/12/why-adding-film-grain-to-digital-photos-is-trickier-than-you-may-think/)
- The Editorial Edit — _Dynamic Film Grain Technology Explained_ — [Article](https://www.theeditorialedit.com/pages/dynamic-film-grain-technology-explained)
- Maxim McNair — _Film Grain (WebGL)_ — [Article](https://maximmcnair.com/p/webgl-film-grain)

### Fuji-Specific

- Fuji X Weekly — _Fujifilm Grain Settings_ — [Article](https://fujixweekly.com/2019/12/06/fujifilm-grain-settings/)
- Fuji X Weekly — _How to Create Film Simulation Recipes_ — [Article](https://fujixweekly.com/2023/12/21/how-to-create-film-simulation-recipes/)
- Fuji Addict — _Fujifilm Color, Image Quality, Simulations Interview_ — [Article](https://fujiaddict.com/2020/12/07/fujifilm-color-image-quality-color-science-simulations-and-more-interview/)
- Fuji Patent 5065256 — _Method of and apparatus for processing image signal_ — [Patent](https://www.freepatentsonline.com/5065256.html)
- BH Photo — _Your Guide to FUJIFILM Film Simulations_ — [Article](https://www.bhphotovideo.com/explora/photography/tips-and-solutions/your-guide-to-fujifilm-film-simulations)
- vmoldo (2025) — _Film Grain Emulation Guide_ — [Article](https://vmoldo.com/film-grain-emulation-2025-guide/)
