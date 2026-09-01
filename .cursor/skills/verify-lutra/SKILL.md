---
name: verify-lutra
description: Drive the real Lutra web app (WebGPU film-simulation photo editor) to prove user-facing behavior — launch the dev server, open a photo, apply adjustments, and capture screenshot + JSON evidence. Reach for this when verifying a change to the frontend/editor/engine, or before claiming the app works.
---

# Verify Lutra

Lutra is a client-side, WebGPU photo color-grading app (see the repo `README.md`). The user surface is the **web UI** at `http://localhost:5173` with three screens: the Gallery (`/`), the Editor (`/edit/:id`), and Collage (`/collage/:id`). This skill launches that app and drives it over the Chrome DevTools Protocol using stable ARIA/`data-` handles, then captures evidence.

The harness launches its **own isolated Chrome** (private profile, private debug port, software-WebGPU flags) and tears down only that Chrome. It never touches the computer-use browser, so it is safe to run alongside an interactive session.

## Launch

From the repo root:

```bash
.cursor/skills/verify-lutra/scripts/launch.sh
```

This installs deps if needed and starts Vite on `http://localhost:5173` (ready when the script prints `Dev server ready`). It runs Vite directly on a fixed port so the app is reachable. Override the port with `LUTRA_PORT`.

Teardown of the dev server (only if you started it and want it gone): find the `vite` pid printed by `launch.sh` (or in its log line) and `kill <pid>`. Leave it running if the user may keep testing.

## Doctor

Before driving anything, confirm the instance is worth driving:

```bash
.cursor/skills/verify-lutra/scripts/doctor.sh
```

It checks (read-only): the dev server answers, a Chrome binary exists, an X display is available (the harness runs Chrome headful on the VNC display, default `:1`), the `ws` module resolves, and the fixture image is present. Exit `0` = `READY`.

## Drive

```bash
node .cursor/skills/verify-lutra/scripts/verify.mjs --scenario smoke
```

Scenarios: `smoke` (open a photo + apply a LUT — the default, exercises the core path), `open` (open a photo only), `lut` (open + LUT), `adjust` (open + Exposure tool). Flags: `--url`, `--image <path>`, `--out <dir>`, `--keep-open` (leave Chrome up for follow-up inspection).

The harness drives the real user path with stable handles, not internal setters:

- Gallery drop zone: `[data-gallery-drop-zone]` — a synthetic `drop` with a real `File` (the reliable open path; the native file picker opens Chrome's own viewer under automation, so avoid it).
- Editor tools: `button[aria-label="Add <Tool> adjustment"]` (e.g. `Add LUT adjustment`, `Add Exposure adjustment`). Tool labels: LUT, Exposure, Contrast, Highlights, Shadows, White Balance, Saturation, Color Mixer, Grain, Vignette, Chromatic Aberration, Clarity, Tone Curve.
- LUT filmstrip thumbnails: `button[aria-label^="Apply "]` (e.g. `Apply Kodak 2393 Cuspclip`); the strip container is `[aria-label="LUT thumbnails"]`.
- Applied layers appear in the right-hand `LAYERS` panel (e.g. a LUT layer shows a `STRENGTH` slider).

New behaviors are added as new `--scenario` branches in `verify.mjs`, reusing its `clickByName`, drop, `shot`, and `evalp` helpers. See `features/` for per-feature recipes.

## Evidence

Screenshots and a `<scenario>-result.json` land in `--out` (default `/opt/cursor/artifacts/verify-lutra` when that dir exists, else `./.verify-artifacts`). The JSON lists each checked step with `ok` + a `detail` (URL reached, clicked handle, canvas dims, console errors). `verify.mjs` exits non-zero if any checked step fails.

Proof standards for this app:

- Exercise the real path (drop/click), never internal state setters or test-only hooks.
- Capture the action **and** the resulting state: the applied LUT layer in `LAYERS` and the graded filmstrip thumbnails, plus the URL change to `/edit/:id`.
- **WebGPU caveat (critical):** on a GPU-less VM the `--enable-unsafe-*` flags expose a SwiftShader adapter, so the app boots and its UI/state flow is verifiable — but the WebGPU **render pipeline cannot be validated here**. The swapchain canvas does not composite (the large main preview stays black and a `createImageBitmap(mainCanvas)` readback is empty), so do not treat the black main canvas as a failure and never use it as proof. Note the LUT filmstrip thumbnails are **CPU-rendered** by `applyLutCpu` (`packages/frontend/src/thumbs/worker.ts`), not WebGPU: they prove LUT/app correctness, not the GPU pipeline. This harness therefore verifies app/UI/state flow (open, layer add, controls) plus CPU LUT rendering; validating WebGPU compute/render itself needs real GPU hardware. On real hardware the main canvas renders normally.

## Cleanup

`verify.mjs` kills the exact Chrome child it spawned (by pid, never by name) and its throwaway profile lives under `/tmp/verify-lutra-*`. Evidence in `--out` is **not** deleted — proof survives teardown. If you passed `--keep-open`, kill the printed Chrome pid when done. Never kill Chrome by process name; you would take down the computer-use browser too.

## Helpers

All executable; invocations shown above.

- `scripts/launch.sh` — deps + Vite dev server, waits for readiness.
- `scripts/doctor.sh` — read-only prerequisite check.
- `scripts/verify.mjs` — the CDP harness (scenarios, evidence, self-teardown).
- `fixtures/sample.png` — a 1200×800 test photo (sunset + mountains), enough color range to make LUTs visibly differ.
