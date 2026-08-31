# Open a photo

Opening a photo turns an image file into a new Edit and lands the user in the editor at `/edit/:id`, with the photo as the base of the adjustment chain. Users open photos from the Gallery by button, drag-and-drop, or paste.

## Sub-features

- `open-drop` drops one or more image files onto the gallery drop zone.
- `open-paste` pastes an image from the clipboard (Gallery route only).
- `open-picker` uses the `Open a photo to start editing` button / top-nav `Open photo`.
- `open-editor` the resulting editor shows the image-sized canvas and the tool rail.

## How to get to it (user POV)

- Drop image files anywhere on the Gallery (the drop zone spans the screen; an overlay reads "Drop photos").
- Press Ctrl/Cmd+V on the Gallery with an image on the clipboard.
- Choose `Open a photo to start editing` (center) or `Open photo` (top-right), then pick a file.

## Driving it with the CDP harness

Preconditions:

- `doctor.sh` reports `READY`; the Gallery loads past the WebGPU gate (`gallery-loaded` check passes).

- **Open via drop.** Run `node .cursor/skills/verify-lutra/scripts/verify.mjs --scenario open`. The harness builds a real `File` from `fixtures/sample.png`, adds it to a `DataTransfer`, and dispatches `dragenter`/`dragover`/`drop` on `[data-gallery-drop-zone]`.
- **Result — editor reached.** The `open-photo` step asserts `location.href` matches `/edit/:id`; the `editor-canvas` step asserts a `<canvas>` with a numeric width exists (it records the reported `w`/`h` — `1200×800` for the fixture — but only requires a numeric width, so a wrong-sized render is not caught by this check alone).
- **Proof.** `open-gallery.png` (loaded gallery) and `open-editor.png` (editor with the tool rail and `LAYERS` panel), plus `open-result.json` recording the reached URL and canvas size.

## Gotchas

- Do not use the native file picker under automation: clicking it opens Chrome's built-in image viewer instead of feeding the app. Use the drop path.
- Paste only works while the route is `Gallery`; the editor ignores it.
- The main canvas is black under software WebGPU — that is expected here and is not evidence of a failed open. Prove the open by the URL change and the canvas element. (Applying a LUT exercises CPU rendering, not the GPU pipeline — see apply-lut.)
- The Gallery may show "Preparing offline library" while precaching LUTs; this does not block opening a photo.
