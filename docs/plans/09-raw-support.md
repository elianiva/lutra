# RAW support (client-side full-res decode via an owned LibRaw wasm build)

Status: **Decided — ready to implement** (2026-02-19 implementation-planning grilling
session; architecture decisions in docs/adr/0014, full research in
`docs/research/raw-support.md`). This plan is the implementation reference: the
decisions D1–D9 below were resolved one by one in the session, and every phase,
shape, and rationale is recorded so the implementer does not re-derive or
re-litigate anything.

## Goal

Open camera RAW files (CR2/CR3, NEF/HE, ARW, RW2, ORF, RAF, PEF, SRW, DNG —
including phone DNGs) in the web app: decoded **client-side at full
resolution** by our own build of LibRaw 0.22.1 in a wasm worker, landing in the
existing WebGPU chain as an **sRGB-encoded 16-bit source texture** — the engine
changes nothing about how a source is consumed. "Proper" means real demosaicing
of the full-res sensor data with as-shot white balance and camera color matrix
— not the embedded JPEG preview (which stays as the instant placeholder path)
and not the mobile app's platform transcode.

## Why (summary of the research + planning sessions)

- Chromium has no RAW decode anywhere (`ImageDecoder`/`createImageBitmap`/`<img>`);
  Safari's system RAW is OS-controlled and 8-bit; so bringing a decoder to the
  browser was the only "all formats, all platforms" option. The candidates and
  the choice are fully documented in `docs/research/raw-support.md` §2 and
  ADR 0014: **LibRaw 0.22.1 via our own wasm build** won on camera coverage and
  proven demosaic quality; the Rust stack (rawler + `demosaic`, RawSpeed's
  in-progress official Rust port) is the watch item, not v1.
- The engine's contract (pass-0 `srgbToLinear`, LUTs read sRGB at position 0,
  `chain-source.ts`) makes an **sRGB-encoded 16-bit decode a drop-in**: the
  decode applies the exact curve (`gamm [1/2.4, 12.92]`) that pass 0 inverts,
  so the source texture is just higher precision than today's 8-bit JPEG/PNG.
  A linear working space would touch four engine sites for near-zero visible
  difference in an sRGB-authored, 8-bit-export app — documented future step,
  not v1 (ADR 0014 D2).
- The planning session resolved the *implementation* shape: an owned build
  (`bun run build:raw`, D1), an app-lifetime worker with one dispose point (D2),
  a typed source union through engine and model (D3/D6), magic-byte sniffing
  (D4), a PubSub + root-subscription progress conduit (D5 — the only foldkit
  mechanism with service access and message-pipeline delivery), an instant
  gallery flow (D7), and an honest test split (D8/D9).

## Current state (verified facts)

The integration surface, read from source:

- **Engine** — `engine/src/render.ts`: `RenderRequest { shader, uniforms,
  srcBitmap: ImageBitmap, frame, luts }`; `createRenderRequest(chain, registry,
  srcBitmap, frame, luts)` is pure — it never touches pixels; the GPU backend
  does the upload. `render.test.ts` uses a `fakeBitmap()`.
- **GPU backend** — `frontend/src/gpu/backend.ts`: `buildSession` creates the
  source texture as `rgba8unorm` and uploads via `copyExternalImageToTexture`;
  the `Session` **retains `srcBitmap`** so `present` can rebuild the session on
  canvas resize without the original request. `GpuBackendLive` scopes all state
  in Refs per Layer instance — documented as *no module globals* (HMR/tests) —
  which is the reason a module-level PubSub was rejected (D5). The LUT upload
  precedent (`writeTexture` into a 3D texture, 16 bytes/texel exact match —
  Chrome's f32→f16 writeTexture conversion is broken, so they avoid
  conversions) is the model for the rgba16unorm upload (8 bytes/texel exact
  match, no conversion).
- **Editor flow** — `editor/command.ts`: `PickImageFile` accept list is
  `['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif']` (RAW extensions
  missing); `DecodeImage` reads `file.arrayBuffer()` (the bytes ARE the Edit's
  source) then `createImageBitmap(file)` → `ImageDecoded { bitmap, width,
  height, source }`; `LoadEdit` decodes stored bytes via
  `createImageBitmap(new Blob([edit.source]))` — **no filename exists in the
  Edit schema** (`{ id, chain, source, thumbnail, savedAt }`), so routing by
  extension is impossible there: magic sniffing is the only signal (D4).
- **Model/messages** — `editor/message.ts`: `SourceImage` is a flat struct
  `{ bitmap: NullOr(instanceOf(ImageBitmap)), width, height, error:
  NullOr(SourceError) }`; `SourceError` union (ADR 0010 mechanism — tagged
  errors, no flattened strings). `editor/model.ts` holds `source`; `update.ts`
  already guards stale completions ("Double-pick race" comments — the pattern
  the decodeId guard extends).
- **Phase machine** — `editor/phase.ts`: `Empty | Loading | Error | Idle |
  Drafting | Selected`; `Loading` self-loop on `SelectedImageFile` fires a
  second `DecodeImage` (superseding pick) — the point where the old decode is
  disposed (D2). The machine needs **no new state**.
- **LUT thumbs** — `editor/update.ts` `generateThumbCommands` reads
  `model.source.bitmap` and fires `GenerateLutThumb({ lutId, bitmap })` per
  strip entry without a preview; `thumbs/worker-layer.ts` (`LutThumbnailer`)
  downscales the bitmap to 200×200 once per photo (cached by bitmap identity)
  and applies the cube in a worker pool — the contract is bitmap-based and
  stays bitmap-based; RAW photos supply `lutBitmap` instead (D6).
- **Gallery** — `gallery/command.ts`: `PhotoCreated` reads bytes, makes a
  320 px JPEG thumbnail via `createImageBitmap` + canvas 2D, saves a
  self-contained Edit (fresh uuid, empty chain). Mirrors `IMAGE_TYPES`.
- **Errors** — `frontend/src/errors.ts`: `ImageDecodeError` etc. as
  `Schema.TaggedErrorClass` (ADR 0010).
- **Root/app** — `root/model.ts` holds `{ route, gallery, editor }` — the root
  **does hold the editor slice**, which is what makes a root subscription keyed
  on the editor's phase possible. `main.ts` wires `resources` via
  `Layer.merge(...)`; the app uses **no subscriptions today**.
- **foldkit facts (verified in the installed runtime, 0.137.0)** — commands
  return exactly one message (`Command.define`, `command/index.d.ts`); command
  effects run with app Resources but **without** `Dispatch`
  (`runtime.js:659` `runForkWith(runtimeContextForCommands)` vs `:858` where
  render/mount effects get `Dispatch`); `Mount.defineStream` factories are
  typed `R = never` (`mount/index.d.ts:266`) — no service access, no args;
  **root `Subscription`s run with `provideAllResources`** (`runtime.js:1097`)
  and their emissions enter the update loop as normal messages. Conclusion:
  the subscription is the only service-capable, message-pipeline conduit for
  mid-command events (D5).
- **libraw-wasm (the fork base, ybouane/LibRaw-Wasm v1.6.0)** — LibRaw 0.22.1,
  Emscripten 5.0.7, `-O3 -flto -ffast-math -msimd128`, OpenMP + pthreads,
  `INITIAL_MEMORY=256MB` + growth, ~1.4 MB wasm. API: `open(bytes, settings)`
  (parse only, cheap), `metadata(full?)`, `imageData()` → interleaved RGB
  `Uint16Array` (colors: 3), `rawImageData()` (Bayer mosaic — the GPU-demosaic
  seam), `thumbnailData()` (embedded JPEG), `dispose()`; calls serialized per
  instance; errors reject with LibRaw error strings. Dist spawns its worker via
  `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})` —
  Vite-compatible (same as jSquash). `compileLibraw.sh` (123 lines, read in
  full): Stage A builds LCMS 2.19.1 + LibRaw static libs with
  `emconfigure`/`emmake` (git-tag-pinned clones, incremental `libs/` reuse,
  `FORCE_LIBS=1`), Stage B links the wrapper with `emcc --bind` + Emscripten
  ports (`USE_LIBJPEG`, `USE_LIBPNG`, `USE_ZLIB`, pthreads) then `node
  build.js` packages the dist. JPEG8 is forced (`USE_JPEG8`) — required for
  lossy DNG and Kodak RAW.
- **Formats/magic (verified)** — TIFF magic `49 49 2A 00` / `4D 4D 00 2A`
  covers DNG/CR2/NEF/ARW/RW2/ORF/PEF/SRW; CR3 is ISO-BMFF: bytes 4–7 `ftyp`,
  bytes 8–11 major brand `crx ` (`63 72 78 20`); RAF starts with the 16-byte
  magic `FUJIFILMCCD-RAW `.
- **Performance/memory (research §9)** — 24 MP decode ~0.6–1.4 s desktop
  (AHD 1.5–3 s expected), phones several seconds; Bayer 48 MB + RGB16 144 MB +
  RGBA16 padded 192 MB in the worker; wasm heap ceiling ~2 GB (100 MP
  practical cap); ~1 s per photo at full res; embedded JPEG extraction <50 ms.
- **Samples (verified)** — raw.pixls.us is a flat directory tree
  `/data/<Maker>/<Camera>/*.EXT`; `Apple/iPhone 12 Pro/IMG_1361.DNG` (29 MB)
  exists — the iPhone 12 Pro is the ProRAW camera from darktable #7578
  (12 MP linear DNG), so the linear-DNG question is spike-settlable without
  owning an iPhone.

## Design

### D1 — Packaging: the owned build in `packages/raw-decoder/`

A new workspace package `@lutra/raw-decoder` (pnpm `packages/*` already picks
it up; add a `build:raw` root script — **not** a turbo task; the dist is
committed so turbo/dev never build it):

```
packages/raw-decoder/
  cpp/libraw_wrapper.cpp      ← the forked wrapper (~1100 lines, ours to edit)
  cpp/worker.js               ← forked worker (gains progress + preview + dispose-reject)
  scripts/build.ts            ← the build, in Bun (below)
  scripts/fetch-samples.ts    ← pinned raw.pixls.us URLs → gitignored spike/ dir
  dist/                       ← committed build output (libraw.js + libraw.wasm + worker.js)
  src/
    client.ts                 ← the TS client (open/metadata/imageData/rawImageData/
                               thumbnailData/onProgress/dispose), framework-free
    is-raw.ts                 ← isRawBytes(bytes) magic sniff (pure)
    settings.ts               ← RawSettings schema (Effect Schema) + the decode block
    error.ts                  ← RawDecodeError (TaggedErrorClass, house convention)
    dng.ts                    ← synthetic minimal DNG generator (tests + spike)
    pad.ts                    ← RGB16 → RGBA16 padding (pure, unit-tested)
  package.json / tsconfig.json
```

The build (D1): `scripts/build.ts` ported from upstream `compileLibraw.sh` —
`Bun.$` orchestration of git clone (pinned tags), `autoreconf`,
`emconfigure`/`emmake`, `emcc --bind`, then the dist packaging step. Same
Stage A/B split, same incremental `libs/` reuse, `--force-libs` and `--clean`
flags instead of env vars, and a clear "emsdk not on PATH" failure. Root
`package.json` gains `"build:raw": "bun packages/raw-decoder/scripts/build.ts"`
(ADR 0014 documents this command; it stays true). Emsdk requirement: on PATH,
activated by the developer's own toolchain (official emsdk or nixpkgs) — the
script only checks and fails loudly. Dist is committed, so devs without emsdk
never rebuild; rebuilding is a version-bump-day activity. License texts
(LGPL-2.1/CDDL LibRaw, ISC wrapper, MIT LCMS) ship in the package.

### D2 — Worker lifecycle: app-lifetime singleton, one dispose point

- The frontend `RawDecoder` Context service (in `frontend/src/raw/`, shape:
  `decode(bytes, settings) → DecodedRaw`, `preview(bytes) → Uint8Array`,
  `dispose()`, plus the events PubSub of D5) wraps the package client. **One
  worker for the app session** — a resource in `main.ts`'s `Layer.merge`,
  exactly like `GpuBackendLive`.
- **Hold**: no dispose on image clear, none on editor exit. The worker heap
  (~448 MB at 24 MP) is the small allocation next to the GPU session it feeds
  (~576 MB: srcTex + dstTex + two rgba16float intermediates); a warm heap
  makes every subsequent decode and every gallery embedded-JPEG extraction
  faster; release-for-honesty bought latency and lifecycle races for nothing.
- **Dispose only on superseding pick** (the `Loading` self-loop): a second
  pick while a decode is stuck in `dcraw_process` cannot be cancelled and the
  worker's serialized queue would make the new pick wait ~1–3 s behind the
  old decode. Dispose + respawn kills the stale decode and starts the new one
  in ~300 ms. **Requirement on our fork's client**: on dispose, every pending
  call rejects with `RawDecodeError({ message: 'decode superseded' })` — the
  Loading phase must never hang on a promise that can't settle.
- **Pre-warm**: the service layer spawns the worker eagerly at boot (forked,
  non-blocking — boot must not wait on wasm compile) so the first RAW open
  never pays compile + 256 MB init.

### D3 — Engine seam: the source union

`engine/src/render.ts` — `srcBitmap: ImageBitmap` becomes one discriminated
`src`:

```ts
export type Source =
  | { readonly kind: 'bitmap'; readonly bitmap: ImageBitmap }
  | { readonly kind: 'rgba16'; readonly width: number; readonly height: number;
      readonly data: Uint16Array }

// createRenderRequest(chain, registry, src, frame, luts)
```

The engine stays pure (it still never touches pixels — the union just names
the carriers). `render.test.ts`'s `fakeBitmap()` call sites become
`{ kind: 'bitmap', bitmap: fakeBitmap() }`. The union is the exhaustive
shape: a future linear-DNG or GPU-demosaic source adds a member without
signature churn.

### D3 · GPU backend: the rgba16 upload path (part of D3)

`gpu/backend.ts` `buildSession` matches on the source:

- `bitmap` → today's `copyExternalImageToTexture` into `rgba8unorm`.
- `rgba16` → `device.createTexture({ format: 'rgba16unorm', usage:
  TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT })` + `queue.writeTexture`
  with `bytesPerRow = width * 8` — 8 bytes/texel, exact type match, no
  conversion (the LUT upload's lesson). rgba16unorm is filterable and
  `textureLoad` returns 0..1 f32 — no shader change.

The `Session` retains the whole source (bitmap **or** the RGBA16 buffer) so
`present`'s resize-rebuild works unchanged. The 192 MB buffer therefore lives
in the session for the image's lifetime — same lifecycle as today's retained
`srcBitmap`.

### D4 — Sniffing: magic-primary, one pure function

`raw-decoder/src/is-raw.ts`:

```ts
export const isRawBytes = (bytes: Uint8Array): boolean =>
  tiffMagic(bytes) || cr3Magic(bytes) || rafMagic(bytes)
// TIFF:  49 49 2A 00 | 4D 4D 00 2A
// CR3:   bytes[4..7] === 'ftyp' && bytes[8..11] === 'crx '
// RAF:   bytes[0..15] === 'FUJIFILMCCD-RAW '
```

Used by `DecodeImage`, `LoadEdit`, and gallery `PhotoCreated` — every flow
already holds the bytes. Extensions appear only in the picker accept list
(`PickImageFile` + gallery `IMAGE_TYPES` gain `.dng .cr2 .cr3 .nef .nrw .arw
.rw2 .orf .raf .pef .srw .3fr .iiq .erf .mef .mrw .x3f .fff .raw`; `image/*`
stays — Safari serves RAW MIMEs through it). Misrouting self-heals: the
settled retry rule (research D11) is `RawDecodeError` → one
`createImageBitmap` retry → `ImageDecodeError`; a plain TIFF that LibRaw
chokes on still opens.

### D5 — Progress + placeholder: service PubSub + root subscription

Commands return one message and have no `Dispatch` (verified — see Current
state). The conduit is foldkit's root `Subscription`:

- The `RawDecoder` service holds `events: PubSub<RawDecodeEvent>` where
  `RawDecodeEvent = RawPreviewReady({ decodeId, previewUrl }) |
  RawDecodeProgress({ decodeId, stage, percent })` (coarse stages:
  `'unpacking' | 'processing' | 'preparing'` — mapped in our wrapper from
  LibRaw's ~20 `libraw_progress_t` stages).
- `DecodeImage` (RAW path): generate `decodeId` → `preview(bytes)` (embedded
  JPEG, <50 ms) → create blob URL → publish `RawPreviewReady` → fork the
  progress bridge (worker `onProgress` → publish) → `decode(bytes, settings)`
  → return `ImageDecoded` (completion stays the command's single message).
  On supersede (D2): `dispose()` + respawn first.
- One root subscription keyed on `model.editor.phase === 'Loading'` (the root
  holds the editor slice): `dependenciesToStream` returns
  `Stream.fromPubSub(service.events)`; emissions map to
  `GotEditorMessage(...)` and enter the editor's update like any message.
  When the phase leaves `Loading`, the stream tears down.
- **The guard**: editor update drops any event whose `decodeId` ≠ the model's
  current `decodeId` (set by `RawPreviewReady`; events before the first
  preview are dropped because there is no current id yet). Same stale-drop
  pattern as the existing bitmap/stamp guards.
- The Loading view renders the placeholder `<img>` (blob URL) + stage bar
  from `model.source.decodeProgress`. `previewUrl` is revoked when the phase
  leaves `Loading` (update-side revocation, the `RevokeLutThumbs`/
  `RevokeExportUrl` pattern).

This machinery is the app's first subscription but deliberately general —
future long operations (export encode, batch import) reuse the same
PubSub + subscription shape (agreed in the session: "we're going to have a
bunch of progress-related things using pubsub anyway").

### D6 — Model: `SourceImage` becomes a discriminated union

```ts
export const SourceImage = S.Union([
  S.Struct({ kind: S.Literal('bitmap'), bitmap: S.instanceOf(ImageBitmap),
             width: S.Number, height: S.Number, error: S.NullOr(SourceError) }),
  S.Struct({ kind: S.Literal('rgba16'), rgba16: S.instanceOf(Uint16Array),
             lutBitmap: S.instanceOf(ImageBitmap),
             width: S.Number, height: S.Number, error: S.NullOr(SourceError) }),
])
```

Loading-phase fields live beside it: `decodeId: NullOr(String)`,
`previewUrl: NullOr(String)`, `decodeProgress: NullOr({ stage, percent })`.
`RenderChain`'s args mirror the engine union 1:1 (`src` instead of `bitmap`).
`generateThumbCommands` uses `source.bitmap` for kind `bitmap`, `source.lutBitmap`
for kind `rgba16` — `LutThumbnailer` and `GenerateLutThumb` are untouched.

The decode worker derives the 1024 px sRGB8 preview from the full decode
(convert RGB16 → RGBA8 — 8-bit is faithful for a preview, the tone curve is
already applied — downscale via `OffscreenCanvas`, hand back with
`transferToImageBitmap()`: zero-copy ImageBitmap transfer, exactly the
`GenerateLutThumb` contract). Embedded JPEGs are never used for LUT thumbs —
they carry the camera tone curve and would mismatch the `noAutoBright` decode
(research D8).

### D7 — Gallery: instant tiles, no full decode

`PhotoCreated` RAW branch: sniff → `rawDecoder.preview(bytes)` (embedded
JPEG) → store those JPEG bytes as the Edit's thumbnail. If the embedded JPEG
is missing/corrupt → the settled retry (`createImageBitmap` once) → else save
the Edit with a tiny built-in placeholder JPEG (a static asset, a few hundred
bytes — the tile is honest: "RAW photo, open to see it"). A full decode never
runs in the gallery; the editor is where the real image appears.

### Errors

`RawDecodeError` lives in `raw-decoder/src/error.ts`
(`Schema.TaggedErrorClass`, house convention) and stays **out** of the
`SourceError` union: the pick flow catches it, retries `createImageBitmap`
once, then surfaces `ImageDecodeError` with the raw error on the cause chain
(research D11 — message unions don't widen). Future tag-level UX (e.g. "your
camera's format isn't supported yet") is noted, not built.

### Decode settings (locked in research §6, ADR 0014 D4 — restated for the implementer)

```ts
open(bytes, {
  useCameraWb: true,        // as-shot WB — untouched image matches the camera preview
  useCameraMatrix: 3,       // always apply the camera color matrix
  outputColor: 1,           // sRGB primaries
  outputBps: 16,            // 16-bit — feeds the rgba16unorm source texture
  gamm: [1/2.4, 12.92],     // the sRGB curve — exactly inverted by pass-0 srgbToLinear
  userQual: 3,              // AHD — the ceiling of the LGPL build (no GPL demosaic pack)
  highlight: 2,             // blend — no magenta/cyan clipping casts
  noAutoBright: true,       // camera's recorded levels as-is; Exposure owns brightness
  userFlip: -1,             // EXIF orientation
  halfSize: false,          // full res always (tiering deferred behind this flag)
})
```

## Decisions

| # | Decision |
|---|----------|
| D1 | Own the build in `packages/raw-decoder/`: forked C++ wrapper + `scripts/build.ts` (Bun, ported from upstream `compileLibraw.sh`), git-tag-pinned deps fetched at build time, **committed dist**, root `build:raw` alias. No justfile, no tarball vendoring — one typed script, house precedent (`scripts/vendor-luts.ts`). |
| D2 | Worker lifecycle: app-lifetime singleton (a `main.ts` resource), heap held; **dispose only on superseding pick** (fork client must reject pending calls on dispose); eager non-blocking pre-warm at boot. |
| D3 | Engine seam: `RenderRequest.src` discriminated union (`bitmap \| rgba16`); backend `buildSession` uploads via `writeTexture` into `rgba16unorm` (8 bytes/texel exact match); session retains the source for resize rebuilds. |
| D4 | Sniffing: magic-primary `isRawBytes` in the package (TIFF + `crx ` BMFF + RAF magic), used by all three image-opening flows; extensions only in the picker accept lists. Misroutes self-heal via the settled retry rule. |
| D5 | Progress/placeholder: service `PubSub<RawDecodeEvent>` + one root subscription keyed on the editor's `Loading` phase; `decodeId` guards in update (house stale-drop pattern). This is the only foldkit conduit with service access + message delivery (verified in the runtime). |
| D6 | Model: `SourceImage` becomes a discriminated union (`bitmap` \| `rgba16` + `lutBitmap`); `RenderChain` args mirror the engine union; LUT thumbs take `lutBitmap` (worker hands it back via `transferToImageBitmap`); Loading state = `decodeId`/`previewUrl`/`decodeProgress` beside it. |
| D7 | Gallery: RAW tile = embedded JPEG bytes; missing/corrupt → one browser retry → built-in placeholder tile; **never a full decode in the gallery**. |
| D8 | Testing: honest split — node unit tests (sniff, schema, padding, synthetic DNG generator) + foldkit scene tests with a mocked `RawDecoder` + real decode verified in the browser (dev fixture page/manual QA). No node-runnable wasm CI attempt (fetch(file://), OffscreenCanvas, pthreads — rabbit hole). |
| D9 | Spike samples from raw.pixls.us via a pinned fetch script (gitignored `spike/`, never committed); `Apple/iPhone 12 Pro/IMG_1361.DNG` settles the linear-DNG/ProRAW question on day one. |

## Implementation order

**Phase 0 — bring-up spike (the gate).** Nothing downstream starts until this
passes. Port `compileLibraw.sh` → `scripts/build.ts`, build the wasm, then:
- decode the pixls samples (D9) in a scratch browser page — verify the full
  pipeline (open → metadata → imageData) and the settings block's output;
- verify the iPhone 12 Pro DNG (linear DNG) decodes — settles research D12;
- verify `set_progress_handler` fires through our wrapper;
- verify Vite asset handling: the forked `worker.js` spawn pattern
  (`new Worker(new URL(...))`) and the `.wasm` import (`?url` or asset
  handling) under `vite dev` and `vite build`;
- verify `dispose()` mid-decode rejects pending calls.

**Phase 1 — `@lutra/raw-decoder` package.** Fork wrapper + worker (progress,
preview derivation, dispose-reject), `scripts/build.ts`, committed dist, TS
client, `is-raw.ts`, `settings.ts`, `error.ts`, `pad.ts`, `dng.ts` (synthetic
generator), unit tests, `fetch-samples.ts`. Wire the workspace package +
root `build:raw`.

**Phase 2 — engine seam.** `Source` union in `render.ts`, `buildSession`
rgba16 path, `render.test.ts` updates. (Pure — verify with existing tests.)

**Phase 3 — frontend.** `RawDecoder` service (main.ts resources + pre-warm);
root subscription; picker accept lists; `DecodeImage`/`LoadEdit` routing +
RAW path (decodeId, preview event, progress bridge, supersede dispose);
`SourceImage` union + `RenderChain` args; update handlers + guards +
revocation; Loading view (placeholder + stage bar); `generateThumbCommands`
carrier pick; gallery `PhotoCreated` RAW branch + placeholder asset;
`RawDecodeError` retry wiring.

**Phase 4 — scene tests.** Routing, phase transitions with progress events,
stale decodeId drops, retry-after-failure, gallery RAW tile (mocked service).

**Phase 5 — manual QA.** Real decode in browser (pixls samples): open → grade
→ compare (binds the rgba16 texture) → LUT bar (lutBitmap) → save → reload
(`LoadEdit` RAW path) → supersede mid-decode → clear → gallery round-trip.
Safari spot check. Memory check (worker heap after clear; session after
resize).

**Phase 6 — docs.** Update `docs/plans/README.md` (row 09) and the research
doc header (point at this plan). ADR only if implementation surfaces a
hard-to-reverse surprise — none expected; ADR 0014 owns the architecture.

## Files

| File | Change |
|------|--------|
| `packages/raw-decoder/` (new) | the package per D1 (cpp/, scripts/, dist/, src/, tests) |
| `package.json` | +`"build:raw": "bun packages/raw-decoder/scripts/build.ts"` |
| `packages/engine/src/render.ts` | `srcBitmap` → `src: Source` union |
| `packages/engine/src/render.test.ts` | fakeBitmap call sites → `{ kind: 'bitmap', ... }` |
| `packages/frontend/src/gpu/backend.ts` | `buildSession` source match; rgba16unorm `writeTexture` path; session retains source |
| `packages/frontend/src/raw/` (new) | `RawDecoder` service (client wrap, PubSub, pre-warm) + root subscription |
| `packages/frontend/src/main.ts` | +`RawDecoderLive` in resources; +`subscriptions` |
| `packages/frontend/src/editor/command.ts` | accept list; sniff routing in `DecodeImage`/`LoadEdit`; RAW path (decodeId, preview, progress, supersede); retry wiring |
| `packages/frontend/src/editor/message.ts` | `SourceImage` union; `RawPreviewReady`/`RawDecodeProgress` events (via subscription) |
| `packages/frontend/src/editor/model.ts` | union source + `decodeId`/`previewUrl`/`decodeProgress` |
| `packages/frontend/src/editor/update.ts` | event handlers + decodeId guards + previewUrl revocation + `generateThumbCommands` carrier pick |
| `packages/frontend/src/editor/view.ts`, `canvas-stage.ts` | Loading placeholder + stage bar |
| `packages/frontend/src/gallery/command.ts` | RAW branch in `PhotoCreated` + accept list + placeholder asset |
| `packages/frontend/src/errors.ts` | imports `RawDecodeError` (rides `ImageDecodeError` cause chain) |
| `docs/plans/README.md` | +row 09 |
| `docs/research/raw-support.md` | header points to this plan |
| `spike/` (gitignored) | fetched samples + scratch page |

## Tests

- **raw-decoder (node vitest):** `isRawBytes` (TIFF/CR3/RAF magics, negatives,
  short buffers); settings schema round-trip; RGB16→RGBA16 padding (dimensions,
  alpha=65535); synthetic DNG generator emits a structurally valid DNG (parsed
  back by the generator's own reader or a tag walk).
- **engine:** existing suite green with the union (`render.test.ts`).
- **frontend (foldkit scene, mocked `RawDecoder` — the `MockImageBitmap`
  pattern):** `DecodeImage` routes RAW vs bitmap; RAW path emits
  `RawPreviewReady` then `ImageDecoded` carrying the rgba16 carrier; progress
  events land in `model.source.decodeProgress`; **stale decodeId drops**
  (superseding pick); retry: raw failure → one `createImageBitmap` retry →
  `ImageFailedToDecode` with the raw error on the cause chain; gallery
  `PhotoCreated` RAW tile uses the embedded JPEG bytes; `LoadEdit` RAW path.
- **Browser (Phase 5 checklist, not CI):** real decode of every pixls sample
  format; compare binds the rgba16 texture; LUT bar uses `lutBitmap`; save →
  reload round-trip; supersede mid-decode; Safari spot check; heap/session
  memory after clear.

## Risks & judgment calls

- **Chrome rgba16unorm upload is untested in this codebase** — the writeTexture
  path (8 bytes/texel exact match) is the Phase-0 verification item; the LUT
  upload precedent suggests it is safe, but the first browser check decides.
- **48 MP ProRAW (iPhone 14 Pro+) Bayer claim** stays a research hedge — pixls
  only settles 12 MP linear DNG; no investment either way (research D12).
- **Decode speed on phones** (several seconds) — the embedded-JPEG placeholder
  + stage bar carry the wait; `halfSize` tiering is deferred behind the
  existing flag if it ever hurts (research D7 note).
- **`previewUrl` revocation** must happen on every `Loading` exit (success,
  failure, clear, supersede) — a leaked blob URL is a small leak, but the
  update-side revocation pattern makes it mechanical.
- **Pre-warm must not block boot** — the worker spawn is forked; if wasm
  compile ever contends with first paint, move the spawn to an idle callback.
- **Embedded JPEG orientation** — tiles are `<img>` blob URLs, and browsers
  honor EXIF orientation in `<img>`, so the tile and the decode agree; verify
  once with a rotated sample in QA.
- **HEIC is unchanged** — Chromium still cannot decode HEIC (fails with
  `ImageDecodeError` as today); ProRAW DNGs from iPhones are the RAW path that
  does work on Chromium.
- **`navigator.storage.persist()`** fires once at first save (research D10) —
  a `SavedOnce` flag in the save command, fire-and-forget.

## References

- `docs/adr/0014-raw-decode-libraw-wasm.md` — the architecture decisions
  (D1–D6 there) this plan implements.
- `docs/research/raw-support.md` — the full research trail, §8 decisions,
  evidence list (WebKit PR #15801, Konvrt benchmark, darktable #7578/#709,
  Rust landscape, PhotonCamera reference).
- `docs/architecture.html` §4 — the sRGB contract; `docs/LUT.html` — the LUT
  layer and filmstrip previews; `context.md` — "RAW files" glossary group.
- This session's decisions (D1–D9 above) were resolved in the
  implementation-planning grilling session, 2026-02-19, one question at a time
  with recommendations; every foldkit runtime fact cited here was read from
  the installed 0.137.0 sources.
