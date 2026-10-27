import type { IconNode } from './icon'

/*
 * Lutra icons (docs/icons). Drawn on the wordmark's geometry: 24 grid, strokes
 * centred on 3-21, flat ends, sharp joins, corners are quadratic curves with
 * the control on the corner (the bowls of the U and R), never circular arcs.
 * Named by what they do in the app, not by what they look like.
 */

/** Gallery page · the saved edits */
export const Edits: IconNode = [
  { d: 'M7 7V6Q7 3 10 3h8Q21 3 21 6v8Q21 17 18 17h-1' },
  { d: 'M6 7h8Q17 7 17 10v8Q17 21 14 21h-8Q3 21 3 18v-8Q3 7 6 7z' },
  { d: 'M3 18l4-4 3 3 2-2 5 5' },
]

/** Tools page · batch, collage, single */
export const Tools: IconNode = [
  {
    transform: 'rotate(45 12 12)',
    d: 'M7 3h3v4h4V3h3v6Q17 12 14 12v7Q14 21 12 21Q10 21 10 19v-7Q7 12 7 9z',
  },
]

/** Appearance · dark */
export const ModeDark: IconNode = [{ d: 'M10 4Q4 4 4 12Q4 20 12 20Q18 20 20 14Q11 14 10 4z' }]

/** Appearance · light */
export const ModeLight: IconNode = [
  { d: 'M12 8Q16 8 16 12Q16 16 12 16Q8 16 8 12Q8 8 12 8z' },
  { d: 'M12 3v2M12 19v2M3 12h2M19 12h2M7 7L5.5 5.5M17 17l1.5 1.5M17 7l1.5-1.5M7 17l-1.5 1.5' },
]

/** Mobile tab · Adjustments */
export const PanelAdjust: IconNode = [
  { d: 'M3 7h3.5M11.5 7H21M3 17h9.5M17.5 17H21' },
  { d: 'M8 4h2Q11.5 4 11.5 5.5v3Q11.5 10 10 10h-2Q6.5 10 6.5 8.5v-3Q6.5 4 8 4z' },
  { d: 'M14 14h2Q17.5 14 17.5 15.5v3Q17.5 20 16 20h-2Q12.5 20 12.5 18.5v-3Q12.5 14 14 14z' },
]

/** Mobile tab · Inspector, layer chain */
export const PanelLayers: IconNode = [
  { d: 'M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5' },
]

/** Settings disclosure */
export const Expand: IconNode = [{ d: 'M6 9l6 6 6-6' }]

/** New edit · add photos · add images */
export const AddPhoto: IconNode = [
  { d: 'M12 4H7Q4 4 4 7v10Q4 20 7 20h10Q20 20 20 17v-5M4 17l5-5 4 4 2-2 5 5M18 3v6M15 6h6' },
]

/** Drag-and-drop overlay */
export const Drop: IconNode = [
  { d: 'M3 8V3h5M16 3h5V8M21 16v5h-5M8 21h-5v-5' },
  { d: 'M12 7v8M8.5 11.5L12 15l3.5-3.5' },
]

/** Export image */
export const Export: IconNode = [{ d: 'M4 14v3Q4 20 7 20h10Q20 20 20 17v-3M12 4v11M7 10l5 5 5-5' }]

/** Download .zip */
export const Zip: IconNode = [
  { d: 'M3 4h18v4H3z' },
  { d: 'M5 8v9Q5 20 8 20h8Q19 20 19 17V8' },
  { d: 'M12 11v6M9 14l3 3 3-3' },
]

/** Reprocess · retry */
export const Reprocess: IconNode = [
  { d: 'M4 11V8Q4 5 7 5h12M16 2l3 3-3 3M20 13v3Q20 19 17 19H5M8 16l-3 3 3 3' },
]

/** Collage · shuffle photos */
export const Shuffle: IconNode = [
  { d: 'M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3' },
]

/** Collage · move photo earlier */
export const MoveLeft: IconNode = [{ d: 'M19 12H5M11 6l-6 6 6 6' }]

/** Collage · move photo later */
export const MoveRight: IconNode = [{ d: 'M5 12h14M13 6l6 6-6 6' }]

/** Tools · height follows the frame */
export const Lock: IconNode = [
  { d: 'M8 11h8Q19 11 19 14v4Q19 21 16 21h-8Q5 21 5 18v-4Q5 11 8 11z' },
  { d: 'M8 11V7Q8 3 12 3Q16 3 16 7v4M12 15v2' },
]

/** Tools · height is set by hand */
export const Unlock: IconNode = [
  { d: 'M8 11h8Q19 11 19 14v4Q19 21 16 21h-8Q5 21 5 18v-4Q5 11 8 11z' },
  { d: 'M8 11V7Q8 3 12 3Q16 3 16 6M12 15v2' },
]

/** Remove photo · delete saved edit */
export const Remove: IconNode = [{ d: 'M6 6l12 12M18 6L6 18' }]

/** Save edit */
export const Save: IconNode = [
  { d: 'M4 7Q4 4 7 4h9l4 4v9Q20 20 17 20H7Q4 20 4 17zM8 4v4h7V4M8 20v-6h8v6' },
]

/** Save as a new edit */
export const SaveCopy: IconNode = [
  { d: 'M12 9h6Q21 9 21 12v6Q21 21 18 21h-6Q9 21 9 18v-6Q9 9 12 9z' },
  { d: 'M15 9V7Q15 4 12 4H7Q4 4 4 7v6Q4 16 7 16h2M15 12.5v5M12.5 15h5' },
]

/** Apply adjustment */
export const Apply: IconNode = [{ d: 'M5 12l5 5 9-9' }]

/** Cancel draft */
export const Cancel: IconNode = [{ d: 'M6 6l12 12M18 6L6 18' }]

/** Add adjustment · ⌘K */
export const AddAdjustment: IconNode = [{ d: 'M12 5v14M5 12h14' }]

/** Adjustment palette search */
export const Search: IconNode = [
  { d: 'M11 4Q18 4 18 11Q18 18 11 18Q4 18 4 11Q4 4 11 4z' },
  { d: 'M16.5 16.5L21 21' },
]

/** Reset curve · reset collage view */
export const Reset: IconNode = [
  { d: 'M5 11V9Q5 5 9 5h6Q19 5 19 9v6Q19 19 15 19H9Q5 19 5 15v-1M2 8l3 3 3-3' },
]

/** Layer is hidden — show it */
export const Show: IconNode = [
  { d: 'M12 6Q21 6 21 12Q21 18 12 18Q3 18 3 12Q3 6 12 6z' },
  { d: 'M12 9Q15 9 15 12Q15 15 12 15Q9 15 9 12Q9 9 12 9z' },
]

/** Layer is shown — hide it */
export const Hide: IconNode = [
  { d: 'M12 6Q21 6 21 12Q21 18 12 18Q3 18 3 12Q3 6 12 6z' },
  { d: 'M5 5l14 14' },
]

/** Delete layer */
export const Delete: IconNode = [
  { d: 'M4 7h16M9 7V4h6v3M6 7v11Q6 21 9 21h6Q18 21 18 18V7M10 11v6M14 11v6' },
]

/** Layer earlier in chain */
export const MoveUp: IconNode = [{ d: 'M12 19V5M6 11l6-6 6 6' }]

/** Layer later in chain */
export const MoveDown: IconNode = [{ d: 'M12 5v14M6 13l6 6 6-6' }]

/** Value stepper · increase */
export const StepUp: IconNode = [{ d: 'M6 15l6-6 6 6' }]

/** Value stepper · decrease */
export const StepDown: IconNode = [{ d: 'M6 9l6 6 6-6' }]

/** Compare off · the edited image */
export const CompareOff: IconNode = [
  { d: 'M12 4H7Q4 4 4 7v10Q4 20 7 20h10Q20 20 20 17v-5M4 17l5-5 4 4 2-2 5 5' },
]

/** Toggle · peek at the original */
export const ComparePeek: IconNode = [
  { d: 'M12 6Q21 6 21 12Q21 18 12 18Q3 18 3 12Q3 6 12 6z' },
  { d: 'M12 9Q15 9 15 12Q15 15 12 15Q9 15 9 12Q9 9 12 9z' },
]

/** Split · drag the divider */
export const CompareWipe: IconNode = [
  { d: 'M6 5h12Q21 5 21 8v8Q21 19 18 19h-12Q3 19 3 16v-8Q3 5 6 5z' },
  { d: 'M12 5v14M8.5 10l-2 2 2 2M15.5 10l2 2-2 2' },
]

/** Side by side */
export const CompareSide: IconNode = [
  { d: 'M6 5h1Q10 5 10 8v8Q10 19 7 19h-1Q3 19 3 16v-8Q3 5 6 5z' },
  { d: 'M17 5h1Q21 5 21 8v8Q21 19 18 19h-1Q14 19 14 16v-8Q14 5 17 5z' },
]

/** Exposure · stops */
export const Exposure: IconNode = [
  { d: 'M6 3h12Q21 3 21 6v12Q21 21 18 21h-12Q3 21 3 18v-12Q3 3 6 3z' },
  { d: 'M20 4L4 20M6 8h4M8 6v4M14 16h4' },
]

/** Contrast */
export const Contrast: IconNode = [
  { d: 'M12 3Q21 3 21 12Q21 21 12 21Q3 21 3 12Q3 3 12 3z' },
  { d: 'M12 3v18' },
]

/** Shadows · the shaded side */
export const Shadows: IconNode = [
  { d: 'M12 3Q21 3 21 12Q21 21 12 21Q3 21 3 12Q3 3 12 3z' },
  { d: 'M3.2 12.5Q12 19 20.8 12.5' },
]

/** Highlights · specular glint */
export const Highlights: IconNode = [{ d: 'M12 3Q12 12 21 12Q12 12 12 21Q12 12 3 12Q12 12 12 3z' }]

/** White balance · temperature, tint */
export const WhiteBalance: IconNode = [
  { d: 'M10 13V5.5Q10 3 12 3Q14 3 14 5.5V13Q17 14 17 17.5Q17 21 14 21H10Q7 21 7 17.5Q7 14 10 13z' },
]

/** Color mixer · RGB channels */
export const ColorMixer: IconNode = [
  { d: 'M9 4Q14 4 14 9Q14 14 9 14Q4 14 4 9Q4 4 9 4z' },
  { d: 'M15 4Q20 4 20 9Q20 14 15 14Q10 14 10 9Q10 4 15 4z' },
  { d: 'M12 10Q17 10 17 15Q17 20 12 20Q7 20 7 15Q7 10 12 10z' },
]

/** Saturation */
export const Saturation: IconNode = [
  { d: 'M12 3L18 11Q19 13 19 15Q19 21 12 21Q5 21 5 15Q5 13 6 11z' },
]

/** Tone curve */
export const ToneCurve: IconNode = [{ d: 'M4 4v16h16M4 20Q12 20 12 12Q12 4 20 4' }]

/** LUT · colour cube */
export const Lut: IconNode = [{ d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9' }]

/** Film grain */
export const Grain: IconNode = [{ d: 'M5 6h2M11 4h2M17 7h2M8 11h2M14 12h2M4 16h2M10 17h2M17 17h2' }]

/** Vignette */
export const Vignette: IconNode = [
  { d: 'M6 5h12Q21 5 21 8v8Q21 19 18 19h-12Q3 19 3 16v-8Q3 5 6 5z' },
  { d: 'M12 9Q17 9 17 12Q17 15 12 15Q7 15 7 12Q7 9 12 9z' },
]

/** Chromatic aberration · channel offset */
export const ChromaticAberration: IconNode = [
  { d: 'M9 6Q15 6 15 12Q15 18 9 18Q3 18 3 12Q3 6 9 6z' },
  { d: 'M15 6Q21 6 21 12Q21 18 15 18Q9 18 9 12Q9 6 15 6z' },
]

/** Clarity · local contrast */
export const Clarity: IconNode = [{ d: 'M12 3l9 9-9 9-9-9zM12 9l3 3-3 3-3-3z' }]
