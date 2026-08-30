# Apply a LUT

A LUT layer applies a film-stock look to the photo. The user opens the LUT tool, picks a film emulation from the bottom filmstrip, and the look becomes a committed layer in the chain (shown in the right-hand `LAYERS` panel with a `STRENGTH` slider). The filmstrip thumbnails are live WebGPU previews of the user's own photo under each film stock.

## Sub-features

- `lut-open` opens the LUT tool and reveals the filmstrip.
- `lut-pick` applies one film emulation to the photo.
- `lut-layer` the applied LUT appears as a layer with an adjustable `STRENGTH`.
- `lut-preview` filmstrip thumbnails render the loaded photo under each LUT (image-processing proof).

## How to get to it (user POV)

- In the editor, choose the LUT tool in the left rail (`Add LUT adjustment`).
- Scroll the bottom filmstrip and click a film preset (e.g. `Kodak 2393 Cuspclip`, tabs like `PRINT`, `NEGATIVE OLD`, `BW`).

## Driving it with the CDP harness

Preconditions:

- A photo is open in the editor (see open-photo). The `smoke`/`lut` scenarios do this first.

- **Open LUT tool.** Run `node scripts/verify.mjs --scenario lut`. The harness clicks `button[aria-label="Add LUT adjustment"]` (`lut-tool-open` step).
- **Pick a preset.** It then clicks the first filmstrip thumbnail `button[aria-label^="Apply "]` (`lut-preset-applied` step records the name, e.g. `Apply Kodak 2393 Cuspclip`).
- **Result — layer committed.** The `lut-layer-present` step asserts the `LAYERS` panel shows a LUT layer with `STRENGTH`.
- **Proof.** `smoke-lut-applied.png` shows the applied `LUT` layer (STRENGTH 100%) and the filmstrip rendering the photo through ~13 film emulations; `lut-result.json` records the applied preset name.

## Gotchas

- The LUT tool is disabled until the LUT catalog loads (its card reads "Loading LUTs…"); if `lut-tool-open` fails, wait and retry — the offline library is still precaching.
- Prove the effect via the filmstrip previews and the committed `LAYERS` entry, not the main canvas (black under software WebGPU).
- Thumbnails are keyed by LUT id and the Recents strip reorders on commit; assert by `aria-label` name, not strip position.
- `STRENGTH` defaults to 100%; a partial-strength check must read the slider value, not just the layer's presence.
