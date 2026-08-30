# Adjustment layers

Beyond LUTs, Lutra offers a fixed palette of adjustment layers — Exposure, Contrast, Highlights, Shadows, White Balance, Saturation, Color Mixer, Grain, Vignette, Chromatic Aberration, Clarity, and Tone Curve. Each is added from the left tool rail and exposes its own controls (sliders / curve) in the right-hand panel, stacking as an ordered layer in the chain.

## Sub-features

- `adjust-open` opens a tool and reveals its controls.
- `adjust-edit` changes a parameter (e.g. Exposure stops) via its slider.
- `adjust-layer` the tool's edit becomes a layer in `LAYERS`.
- `adjust-badge` a tool already in the chain shows an `×N` count badge on its rail button.

## How to get to it (user POV)

- In the editor, click a tool in the left rail. Each button's accessible name is `Add <Tool> adjustment` (e.g. `Add Exposure adjustment`, `Add Contrast adjustment`).
- Adjust the revealed control (labelled e.g. `EXPOSURE`, `CONTRAST`, `TEMPERATURE`/`TINT` for White Balance).

## Driving it with the CDP harness

Preconditions:

- A photo is open in the editor (see open-photo). The `adjust` scenario does this first.

- **Open Exposure.** Run `node scripts/verify.mjs --scenario adjust`. The harness clicks `button[aria-label="Add Exposure adjustment"]` (`exposure-tool-open` step).
- **Result — controls shown.** The `exposure-panel` step asserts the `EXPOSURE` control is visible in the panel.
- **Proof.** `adjust-exposure.png` shows the Exposure control; `adjust-result.json` records the step outcomes.
- **Other tools.** Swap the aria-label to drive a different tool, e.g. `Add Contrast adjustment` or `Add White Balance adjustment`; the panel labels change accordingly (`CONTRAST`, `TEMPERATURE`/`TINT`).

## Gotchas

- Tool buttons are disabled outside the editable phases (`Idle`/`Selected`); they carry `aria-disabled` and won't respond while the edit is loading or drafting.
- Some tools (LUT) gate on catalog load; core adjustment tools do not.
- Prove parameter changes by reading the control value or the resulting `LAYERS` entry, not the black main canvas.
- A tool already in the chain shows an `×N` badge (`[data-testid="in-edit-badge"]`); a second click adds another instance rather than editing the first.
