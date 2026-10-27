# Materials: the app's visual system

## The problem

The editor was drawn with borders. Every region — the tool panel, the canvas, the layer drawer, the LUT bar — was a 1px box on a flat background, with radius 0 everywhere. That worked while the app was one dense screen, but it had three costs:

- **Borders carried the layout.** Adding a region meant adding a line, and the lines competed with the photograph.
- **Depth was impossible.** A draft, an overlay and a popover all looked equally close to the viewer.
- **One mode only.** The app was dark by construction: the background was a fixed `#111` and every token was a literal.

## The decision

Separation comes from four devices, and a surface never draws an outline:

1. **Tonal steps.** Four surface roles, borrowed from Material 3's surface containers: page background, surface 1 (panels), surface 2 (grouped strips and chips), surface 3 (overlays). A surface is separated from what is behind it by being a different tone, not by a stroke.
2. **Rim light.** Every floating surface carries a 1px inset highlight along its top edge, the specular edge Linear's liquid-glass work describes. It reads as a lit edge at any size and replaces the top border.
3. **Ambient shadow.** A tight contact shadow plus a wide soft one: the contact shadow anchors the surface, the wide one gives height.
4. **Recessed wells.** Content that belongs together (stock, space, the stock contact sheet) sits one tone _down_ in a `well` with an inset shadow. Grouping is a surface change, not a divider.

Where a separator is genuinely needed — the tool rail's group boundaries, a list that scrolls under a footer — the line is a gradient that fades at both ends, never a solid stroke.

Two modes, one structure: `data-mode="dark|light"` on the document root swaps the token values. The mode is stored per browser and painted before the first render (`theme.ts`, `SetTheme`).

## Brand: the Leica palette

The colours come from the Leica M: chrome and white for light mode, black vulcanite for dark mode, and one red. Both modes use near-neutral greys, not tinted ones, so the surround does not shift the eye while grading. **Light is the default**; dark is one toggle away for judging in a dim room.

Red has two roles. **Accent** (`--mat-accent`) marks interactive state: the key button, the selected row, the slider fill. **Signal** (`--mat-signal`, `text-signal`) is identity only: the LUTRA wordmark and the red bar of the L in the app icon. In light mode they share one red (`#c40f18`); in dark mode the accent is lifted to `#ff4a4f` to reach 5:1 on panels.

Type has three faces: **Chakra Petch** (400 / 500 / 600) for the interface and labels, **JetBrains Mono** (400 / 500) for numerals, and **Instrument Serif** italic for the print caption (`.serif`). All three load from `@fontsource` in `entry.ts`; nothing falls back to a system font.

## The shell

The canvas is the window. Nothing reserves a column or a band: the rail, the header, the inspector and the readouts float over a full-bleed canvas, and the print is a single object in the middle of it.

```
┌──────────────────────────────────────────────────────────────┐
│ LUTRA   edit …                                   modes  save │  floats
│ ┌──┐                                          ┌────────────┐ │
│ │  │        ┌──────────────────────┐  ┌────┐  │ inspector  │ │
│ │ra│        │        print         │  │ 01 │  │ (selected  │ │
│ │il│        │  (image + captions)  │  │ 02 │  │  layer)    │ │
│ │  │        │ LUMA ──  100%  ◐ ◫ ▥ │  │ 03 │  └────────────┘ │
│ └──┘        └──────────────────────┘  │ +Add│                │
└───────────────────────────────────────┴────┴────────────────┘
```

- **Tool rail** (`tool-panel.ts`): thirteen icons floating at the left edge. Hover or focus opens a card with the tool's number, name and copy — labels live in the card so the rail stays narrow enough to float.
- **Print** (`canvas-stage.ts`): one card holding the image stage, the plate label, the serif caption and the frame's own bar — the luma readout, the zoom level and the compare presentation. Its size follows the image's aspect ratio.
- **Chain rack** (`chain-dock.ts`): the edit chain sits beside the print's right edge as one card, flush in its rows and sized to them — a short chain is a short rack, with a 12px gap to the frame. Rows are numbered top to bottom on a gradient spine; a draft hangs off the end; the last row is `Add`. An empty chain has no rack; the frame stays a print.
- **Inspector** (`layer-drawer.ts`): the selected layer's parameters, floating at the right edge. A draft uses the same shape with Cancel / Apply in the footer, and a chain layer carries its position row.
- **Palette** (`palette.ts`): the rack's `Add` row or ⌘K opens a searchable list of all thirteen tools, grouped Look / Light / Color / Film / Optics. Adding an effect has exactly two entry points in the whole app: the rail (icons, for a known tool) and this palette (search, for an unknown one). The root's `editorPaletteShortcut` subscription owns the key binding, because the palette is only in the DOM while it is open.
- **Luma readout** (`frame-bar.ts`): the graded frame's luminance drawn inside the print card, left of the zoom and compare controls. It reads the frame, so it belongs to the frame and travels with it when the stage pans or zooms.

Spacing is one 4px scale (4 / 8 / 12 / 16 / 24 / 32 / 48) with 24px gutters, 16px panel padding, 44px rows, and 32 / 36 / 40px controls. Type is one scale: 8 / 9 / 10 / 12 / 16 / 20.

## Consequences

- **ADR 0010's layout no longer applies.** The tool panel, the layer drawer and the LUT bar are gone; the rail, inspector, rack, palette and the frame bar replace them. The compare presentation rule, the draft transaction and the responsive/touch rules from 0010 still hold.
- **The LUT bar is a contact sheet.** Browsing stocks happens inside the inspector's well (`lut-bar/sheet.ts`). Hover still previews (`PreviewedLut`), click still commits (`ChangedDraftLut` / `ChangedLayerLut`), and per-photo thumbnails and the offline gate are unchanged. The `lutBarOpen` flag and `ToggledLutPicker` are retired: the sheet is shown whenever the target is a LUT.
- **Reordering moved.** It left the drawer rows for the inspector's position row. The rack reads the chain top to bottom; "move up" means earlier.
- **One add path per layout.** The rack's `Add` row replaces the inspector footer's `+`, the empty inspector's button and the phone tab bar's `Add` tab. Below `lg` there is no tool rail and no tab bar: the rack is always drawn (even empty) so `Add` is always reachable, the palette opens as a bottom sheet, and the inspector is a bottom sheet that exists only while a layer or draft is selected (a tap on the print or the grabber dismisses it). Fewer buttons, one place to look.
- **Every mode is a token set.** A new brand colour or a new mode is a change to `styles.css` alone. Components never hardcode a surface colour; they use `bg-s1`, `bg-s2`, `bg-well`, `text-ink`, `text-muted`, `text-dim`, `bg-accent` and the `surface` / `well` / `pill` utilities.
- **The gallery follows the tokens.** Its structure is unchanged; it inherits the palette, radii and shadows.
- **Contrast is verified per mode, not per component.** The measured ratios live with the tokens: body text ≥ 14:1, secondary ≥ 5:1, micro labels ≥ 4:1 in both modes.
