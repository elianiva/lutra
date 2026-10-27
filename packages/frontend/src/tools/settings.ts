import { Schema as S } from 'effect'
import { ExportFormat, ResizeMethod, defaultExportOptions } from '@lutra/engine'
import type { ExportSettings } from '@lutra/engine'
import { Frame } from './geometry'

/**
 * The output settings both modes share: the target width and height, the resampler, the
 * codec, and the frame and border colours. Single mode also uses `frame`;
 * collage mode picks its own canvas ratio.
 */
export const Settings = S.Struct({
  width: S.Number,
  /** `null` keeps the height locked to the frame (and the photo's own ratio);
   *  a number unlocks it, and the output is exactly width × height. */
  height: S.NullOr(S.Number),
  method: ResizeMethod,
  format: ExportFormat,
  quality: S.Number,
  frame: Frame,
  background: S.String,
  borderPercent: S.Number,
  borderColor: S.String,
})
export type Settings = typeof Settings.Type

export const defaultSettings: Settings = {
  width: 1080,
  height: null,
  method: 'lanczos3',
  format: 'jpeg',
  quality: 90,
  frame: 'original',
  background: '#ffffff',
  borderPercent: 0,
  borderColor: '#ffffff',
}

export const WIDTH_RANGE = { min: 100, max: 8000 } as const
export const HEIGHT_RANGE = WIDTH_RANGE
export const QUALITY_RANGE = { min: 1, max: 100 } as const
export const BORDER_RANGE = { min: 0, max: 20, step: 0.5 } as const

export const clampNumber = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback

/**
 * The engine encode settings for an already-sized frame: the pipeline does its
 * own exact-size resize, so the engine never rescales (`scale: 1`).
 */
export const encodeSettings = (settings: Settings): ExportSettings => ({
  format: settings.format,
  quality: settings.format === 'png' ? null : settings.quality,
  scale: 1,
  resizeMethod: settings.method,
  options: defaultExportOptions(),
})

export const extensionFor = (format: Settings['format']): string =>
  format === 'jpeg' ? 'jpg' : format
