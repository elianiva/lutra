# Lutra verification map

The maintained source for verifying Lutra's user-facing behavior. Read this index, then use the matching feature file as the recipe. Keep it honest as the app changes.

## Baseline preconditions

- Launch Lutra with `scripts/launch.sh`; it serves `http://localhost:5173` (override with `LUTRA_PORT`).
- Run `scripts/doctor.sh` and require `READY` before driving.
- The harness (`scripts/verify.mjs`) launches its own isolated Chrome with software-WebGPU flags on the X display (`DISPLAY`, default `:1`); it never drives the computer-use browser.
- Only drive an instance this run started. Never kill Chrome by process name.

## Driving conventions

- Prefer stable handles: `data-` attributes and ARIA labels over CSS position or coordinates.
- Open a photo by dropping a `File` on `[data-gallery-drop-zone]`, not the native file picker (under automation the picker opens Chrome's own image viewer).
- Treat commands as literal; keep quoted handle names unchanged.
- Evidence goes to `--out`; do not delete it during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Prove image processing via the LUT filmstrip previews / the applied `LAYERS` entry, plus the `/edit/:id` URL change — **not** the main canvas (black under software WebGPU; see SKILL.md).
- Record the feature ID and the entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition; never report a skipped entry point as verified through another path.

## Feature entry contract

Each feature file: an H1 title, one paragraph of user-visible behavior, then exactly four H2s in order — `Sub-features`, `How to get to it (user POV)`, `Driving it with the CDP harness`, `Gotchas`.

## Features

- [Open a photo](./open-photo.md) — drop / paste / picker into the editor (`smoke`, `open`).
- [Apply a LUT](./apply-lut.md) — film-emulation layer from the filmstrip (`smoke`, `lut`).
- [Adjustment layers](./adjustment-layer.md) — Exposure/Contrast/etc. tools (`adjust`).

## Additional entry points to cover (not yet scripted)

These are real user features with no dedicated scenario yet; add `--scenario` branches to `verify.mjs` as they are needed. A proof that only drives the scripted three is incomplete when a change touches these.

- Save an edit / gallery persistence (`Save`, `Save as`) → tile appears in the Gallery.
- Export an image (export dialog → download). Note: export does a GPU readback; verify whether it succeeds under software WebGPU before relying on it.
- Compare (`Toggle` / `Split` / `Side by side`) in the editor bottom bar.
- Create / edit a Collage (`/collage/:id`).
- Reorder / delete adjustment layers.
