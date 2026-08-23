import { defaultTileFraming, type TileFraming } from '@lutra/store'

/**
 * Tile-framing math (docs/adr/0009-collage): the pure geometry that maps a tile's
 * persisted `{ zoom, focusX, focusY }` onto a rectangular cell, shared by
 * every consumer — the collage screen preview (CSS percentages), the main
 * menu's mini-preview (the same percentages), and export (canvas draw
 * rects). All sizes here are fractions of the cell; callers multiply by
 * pixel dimensions.
 *
 * Coordinates: `focusX`/`focusY` are the image point (fractions of the
 * image's width/height) centered in the cell; `zoom` is relative to
 * cover-fit — 1 = cover, the smallest zoom that fills the cell (PicsArt-
 * like: the image always covers the cell, never revealing background bars).
 * Above 1 it crops further; below 1 is clamped to cover.
 */

/** The UI's maximum zoom, relative to cover-fit. */
export const MAX_ZOOM = 4

export { defaultTileFraming }

export interface Placement {
  /** Drawn width / cell width. */
  readonly width: number
  /** Drawn height / cell height. */
  readonly height: number
  /** Drawn left edge / cell width (≤ 0 when overflowing, ≥ 0 when barred). */
  readonly left: number
  /** Drawn top edge / cell height. */
  readonly top: number
}

/**
 * Base drawn dimensions at zoom 1 (cover): one axis fills the cell exactly,
 * the other overflows by the aspect mismatch. `rel = imageAspect/cellAspect`
 * (> 1 = the photo is wider than the cell).
 */
const coverSize = (imageAspect: number, cellAspect: number) => {
  const rel = imageAspect > 0 && cellAspect > 0 ? imageAspect / cellAspect : 1
  return rel >= 1 ? { width: rel, height: 1 } : { width: 1, height: 1 / rel }
}

/** The smallest zoom at which the whole photo is visible inside the cell. */
export const fitZoom = (imageAspect: number, cellAspect: number): number => {
  const size = coverSize(imageAspect, cellAspect)
  return Math.min(1 / size.width, 1 / size.height)
}

export const clampZoom = (zoom: number, _imageAspect: number, _cellAspect: number): number => {
  if (!Number.isFinite(zoom)) {
    return 1
  }
  return Math.min(MAX_ZOOM, Math.max(1, zoom))
}

/**
 * The focus clamped so the drawn rect stays within its legal range: centered
 * when the axis doesn't overflow (bars), anywhere along the overflow when it
 * does.
 */
const clampFocus = (focus: number, draw: number): number => {
  if (!(draw >= 1)) {
    // No overflow on this axis — the photo is centered between bars.
    return 0.5
  }
  // left = 0.5 − focus·draw must stay within [1 − draw, 0].
  const low = 0.5 / draw
  const high = (draw - 0.5) / draw
  return Math.min(high, Math.max(low, Number.isFinite(focus) ? focus : 0.5))
}

/** Clamp any framing (persisted, drafted, or hand-built) to legal values. */
export const clampFraming = (
  framing: TileFraming,
  imageAspect: number,
  cellAspect: number,
): TileFraming => {
  const zoom = clampZoom(framing.zoom, imageAspect, cellAspect)
  const size = coverSize(imageAspect, cellAspect)
  return {
    zoom,
    focusX: clampFocus(framing.focusX, size.width * zoom),
    focusY: clampFocus(framing.focusY, size.height * zoom),
  }
}

/** Where the photo sits inside the cell, as cell-fraction rects. */
export const placement = (
  framing: TileFraming,
  imageAspect: number,
  cellAspect: number,
): Placement => {
  const { zoom } = clampFraming(framing, imageAspect, cellAspect)
  const size = coverSize(imageAspect, cellAspect)
  const width = size.width * zoom
  const height = size.height * zoom
  const rawLeft = 0.5 - clampFocus(framing.focusX, width) * width
  const rawTop = 0.5 - clampFocus(framing.focusY, height) * height
  const left = width >= 1 ? rawLeft : (1 - width) / 2
  const top = height >= 1 ? rawTop : (1 - height) / 2
  return { width, height, left, top }
}

/**
 * Pan by a pointer delta expressed in cell fractions (`dx` rightward /
 * `dy` downward): the photo follows the pointer, then clamps at its edges.
 */
export const panned = (
  framing: TileFraming,
  imageAspect: number,
  cellAspect: number,
  dx: number,
  dy: number,
): TileFraming => {
  const { zoom } = clampFraming(framing, imageAspect, cellAspect)
  const size = coverSize(imageAspect, cellAspect)
  return clampFraming(
    {
      zoom,
      // Moving the photo right (+dx) shifts the cell-center's image point left.
      focusX: framing.focusX - dx / (size.width * zoom),
      focusY: framing.focusY - dy / (size.height * zoom),
    },
    imageAspect,
    cellAspect,
  )
}

/** Multiply the zoom (anchored on the current focus point) and re-clamp. */
export const zoomed = (
  framing: TileFraming,
  factor: number,
  imageAspect: number,
  cellAspect: number,
): TileFraming => clampFraming({ ...framing, zoom: framing.zoom * factor }, imageAspect, cellAspect)

/** True when a framing is indistinguishable from the untouched default. */
export const isDefaultFraming = (framing: TileFraming): boolean =>
  sameFraming(framing, defaultTileFraming())

/** Field-level equality — persisted framings never share references. */
export const sameFraming = (a: TileFraming, b: TileFraming): boolean =>
  a.zoom === b.zoom && a.focusX === b.focusX && a.focusY === b.focusY
