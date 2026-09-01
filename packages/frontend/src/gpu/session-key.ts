export type ImageDimensions = {
  readonly width: number
  readonly height: number
}

export type CanvasDimensions = {
  readonly width: number
  readonly height: number
}

export type SessionKey = {
  readonly canvas: HTMLCanvasElement
  readonly image: ImageDimensions
  readonly srcBitmap: ImageBitmap
}

export const toSessionKey = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  srcBitmap: ImageBitmap,
): SessionKey => ({
  canvas,
  image: { height, width },
  srcBitmap,
})

export const sessionKeyEquals = (a: SessionKey, b: SessionKey): boolean =>
  a.canvas === b.canvas && a.image.width === b.image.width && a.image.height === b.image.height && a.srcBitmap === b.srcBitmap

export const canvasDimensionsOf = (canvas: HTMLCanvasElement): CanvasDimensions => ({
  height: canvas.height,
  width: canvas.width,
})

export const canvasDimensionsEqual = (a: CanvasDimensions, b: CanvasDimensions): boolean =>
  a.width === b.width && a.height === b.height
