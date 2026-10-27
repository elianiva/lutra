import { Schema as S } from 'effect'

/**
 * Collage templates and cover-crop math. Pure functions shared by the live
 * preview (main thread) and the export job (worker). No DOM in here.
 */

export const COLLAGE_MAX_CELLS = 9
export const GRID_MAX = 4

/** `[row, col, rowSpan, colSpan]` in template grid units. */
export const Span = S.Tuple([S.Number, S.Number, S.Number, S.Number])
export type Span = typeof Span.Type

/**
 * A rows × cols unit grid plus one span per cell. `spans: null` is a uniform
 * grid where every cell is 1 × 1.
 */
export const Template = S.Struct({
  rows: S.Number,
  cols: S.Number,
  spans: S.NullOr(S.Array(Span)),
})
export type Template = typeof Template.Type

export type Preset = Template & Readonly<{ id: string; label: string }>

export const PRESETS: ReadonlyArray<Preset> = [
  { id: '2-side', label: '2 side', rows: 1, cols: 2, spans: null },
  { id: '2-stack', label: '2 stack', rows: 2, cols: 1, spans: null },
  { id: '3-row', label: '3 row', rows: 1, cols: 3, spans: null },
  { id: '3-col', label: '3 column', rows: 3, cols: 1, spans: null },
  {
    id: '3-left',
    label: '3 feature left',
    rows: 2,
    cols: 2,
    spans: [
      [0, 0, 2, 1],
      [0, 1, 1, 1],
      [1, 1, 1, 1],
    ],
  },
  {
    id: '3-top',
    label: '3 feature top',
    rows: 2,
    cols: 2,
    spans: [
      [0, 0, 1, 2],
      [1, 0, 1, 1],
      [1, 1, 1, 1],
    ],
  },
  { id: '4-grid', label: '4 grid', rows: 2, cols: 2, spans: null },
  { id: '4-row', label: '4 row', rows: 1, cols: 4, spans: null },
  { id: '4-col', label: '4 column', rows: 4, cols: 1, spans: null },
  { id: '6-grid', label: '6 grid', rows: 2, cols: 3, spans: null },
  { id: '6-tall', label: '6 tall', rows: 3, cols: 2, spans: null },
  { id: '9-grid', label: '9 grid', rows: 3, cols: 3, spans: null },
]

const clampGrid = (value: number): number => Math.min(GRID_MAX, Math.max(1, Math.round(value) || 1))

export const uniformTemplate = (rows: number, cols: number): Template => ({
  rows: clampGrid(rows),
  cols: clampGrid(cols),
  spans: null,
})

/** The preset id for a uniform grid, or `custom` when no preset matches. */
export const presetIdFor = (rows: number, cols: number): string =>
  PRESETS.find((preset) => preset.spans === null && preset.rows === rows && preset.cols === cols)
    ?.id ?? 'custom'

export const cellCount = (template: Template): number =>
  template.spans === null ? template.rows * template.cols : template.spans.length

/**
 * A near-square uniform grid that fits `count` photos, capped at
 * `COLLAGE_MAX_CELLS` so a single export job stays within its memory budget.
 */
export const fitGridForCount = (count: number): Template => {
  const target = Math.min(Math.max(1, count), COLLAGE_MAX_CELLS)
  let best = { rows: 1, cols: 1, score: Infinity }
  for (let rows = 1; rows <= GRID_MAX; rows += 1) {
    for (let cols = 1; cols <= GRID_MAX; cols += 1) {
      const cells = rows * cols
      if (cells < target || cells > COLLAGE_MAX_CELLS) continue
      const score = (cells - target) * 10 + Math.abs(rows - cols)
      if (score < best.score) best = { rows, cols, score }
    }
  }
  return uniformTemplate(best.rows, best.cols)
}

export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>

/**
 * Pixel rects for every cell of a template on a width × height canvas with a
 * `gap` band between cells. Rects are floats.
 */
export const layoutCells = (
  template: Template,
  width: number,
  height: number,
  gap: number,
): ReadonlyArray<Rect> => {
  const { rows, cols } = template
  const unitWidth = (width - gap * (cols - 1)) / cols
  const unitHeight = (height - gap * (rows - 1)) / rows
  const toRect = ([row, col, rowSpan, colSpan]: Span): Rect => ({
    x: col * (unitWidth + gap),
    y: row * (unitHeight + gap),
    w: colSpan * unitWidth + (colSpan - 1) * gap,
    h: rowSpan * unitHeight + (rowSpan - 1) * gap,
  })
  if (template.spans !== null) return template.spans.map(toRect)
  return Array.from({ length: rows * cols }, (_, index) =>
    toRect([Math.floor(index / cols), index % cols, 1, 1]),
  )
}

/**
 * Shrink a pixel gap until every cell keeps at least `minCell` pixels on each
 * side, so an extreme gap never collapses the grid.
 */
export const clampGap = (
  template: Template,
  width: number,
  height: number,
  gap: number,
  minCell = 8,
): number => {
  let safe = Math.max(0, gap)
  for (;;) {
    const rects = layoutCells(template, width, height, safe)
    const smallest = Math.min(...rects.map((rect) => Math.min(rect.w, rect.h)))
    if (smallest >= minCell || safe <= 0) return safe
    safe -= 1
  }
}

/** A photo's placement inside its cell: zoom ≥ 1, focal point 0..1. */
export const Adjust = S.Struct({ zoom: S.Number, fx: S.Number, fy: S.Number })
export type Adjust = typeof Adjust.Type

export const defaultAdjust: Adjust = { zoom: 1, fx: 0.5, fy: 0.5 }

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5

export type SourceRect = Readonly<{ sx: number; sy: number; sw: number; sh: number }>

/**
 * The source rect that makes a photo cover a cell (no letterboxing), zoomed
 * around a focal point. fx/fy are 0..1 (0 = left/top, 1 = right/bottom).
 */
export const coverSourceRect = (
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
  adjust: Adjust,
): SourceRect => {
  const scale =
    Math.max(destWidth / sourceWidth, destHeight / sourceHeight) * Math.max(1, adjust.zoom || 1)
  const sw = Math.min(sourceWidth, destWidth / scale)
  const sh = Math.min(sourceHeight, destHeight / scale)
  return {
    sx: (sourceWidth - sw) * clamp01(adjust.fx),
    sy: (sourceHeight - sh) * clamp01(adjust.fy),
    sw,
    sh,
  }
}

/**
 * The focal point after dragging a photo by (dx, dy) cell pixels. Dragging
 * right reveals the left side of the photo, so fx falls. Measured from the
 * drag start, so repeated moves never accumulate error.
 */
export const panAdjust = (
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
  adjust: Adjust,
  dx: number,
  dy: number,
): Adjust => {
  const src = coverSourceRect(sourceWidth, sourceHeight, destWidth, destHeight, adjust)
  const scale = destWidth / src.sw
  const spanX = sourceWidth - src.sw
  const spanY = sourceHeight - src.sh
  return {
    zoom: adjust.zoom,
    fx: spanX > 0 ? clamp01(adjust.fx - dx / scale / spanX) : adjust.fx,
    fy: spanY > 0 ? clamp01(adjust.fy - dy / scale / spanY) : adjust.fy,
  }
}
