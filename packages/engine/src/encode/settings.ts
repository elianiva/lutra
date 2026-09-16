import { Effect, Match, Schema } from 'effect'

export const EXPORT_FORMATS = ['png', 'jpeg', 'webp', 'avif'] as const

export const ExportFormat = Schema.Literals(EXPORT_FORMATS)
export type ExportFormat = typeof ExportFormat.Type

export const ExportQuality = Schema.Number.pipe(
  Schema.check(Schema.isBetween({ maximum: 100, minimum: 0 })),
)
export type ExportQuality = typeof ExportQuality.Type

/**
 * The output scale relative to the rendered frame, in `[0.01, 1]` — `1` is
 * the frame's own pixel size and export never upscales (docs/adr/0004-export). The
 * floor keeps an output pixel count sane and is the single home for the
 * dialog's clamp. The dialog exposes the scale two ways: percentage presets,
 * and exact output width/height typed against the frame.
 */
export const MIN_EXPORT_SCALE = 0.01
export const ExportScale = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(MIN_EXPORT_SCALE)),
  Schema.check(Schema.isLessThanOrEqualTo(1)),
)
export type ExportScale = typeof ExportScale.Type

/** The quick-set percentages the export dialog offers, in display order. */
export const EXPORT_SCALE_PRESETS = [1, 0.75, 0.5, 0.25] as const

/**
 * The resamplers jSquash's resize codec ships without extra wasm — the
 * squoosh resize API's filter family. `lanczos3` is the default.
 */
export const RESIZE_METHODS = ['lanczos3', 'mitchell', 'catrom', 'triangle'] as const
export const ResizeMethod = Schema.Literals(RESIZE_METHODS)
export type ResizeMethod = typeof ResizeMethod.Type

/** MozJPEG knobs the dialog exposes (the codec's remaining options are internal tuning). */
export const JpegOptions = Schema.Struct({
  progressive: Schema.Boolean,
  optimizeCoding: Schema.Boolean,
  /** 0–100; 0 = no smoothing. */
  smoothing: Schema.Number.pipe(Schema.check(Schema.isBetween({ maximum: 100, minimum: 0 }))),
})
export type JpegOptions = typeof JpegOptions.Type

/** libwebp knobs: `effort` is libwebp's `method`, 0 fastest … 6 slowest/best. */
export const WebpOptions = Schema.Struct({
  lossless: Schema.Boolean,
  effort: Schema.Number.pipe(Schema.check(Schema.isBetween({ maximum: 6, minimum: 0 }))),
})
export type WebpOptions = typeof WebpOptions.Type

/** aom knobs: `speed` is aom's speed, 0 slowest/best … 10 fastest. */
export const AvifOptions = Schema.Struct({
  lossless: Schema.Boolean,
  speed: Schema.Number.pipe(Schema.check(Schema.isBetween({ maximum: 10, minimum: 0 }))),
})
export type AvifOptions = typeof AvifOptions.Type

/**
 * Per-format codec options — one struct per lossy format, all present in the
 * record so switching format never loses a choice. PNG (lossless) owns none.
 * This is the squoosh encode API the dialog exposes (docs/adr/0004-export).
 */
export const ExportOptions = Schema.Struct({
  jpeg: JpegOptions,
  webp: WebpOptions,
  avif: AvifOptions,
})
export type ExportOptions = typeof ExportOptions.Type

const defaultJpegOptions = (): JpegOptions => ({
  optimizeCoding: true,
  progressive: true,
  smoothing: 0,
})

const defaultWebpOptions = (): WebpOptions => ({ effort: 4, lossless: false })

const defaultAvifOptions = (): AvifOptions => ({ lossless: false, speed: 6 })

export const defaultExportOptions = (): ExportOptions => ({
  avif: defaultAvifOptions(),
  jpeg: defaultJpegOptions(),
  webp: defaultWebpOptions(),
})

/**
 * User-facing export settings. Crosses the message boundary as validated
 * data and persists across sessions. `quality` is `null` only for PNG, the
 * one format with no quality knob; a lossless WebP/AVIF keeps its value so
 * switching the toggle back does not lose it (the codec call omits quality
 * while lossless).
 */
export const ExportSettings = Schema.Struct({
  format: ExportFormat,
  quality: Schema.NullOr(ExportQuality),
  scale: ExportScale,
  resizeMethod: ResizeMethod.pipe(Schema.withDecodingDefaultTypeKey(Effect.sync(() => 'lanczos3'))),
  options: ExportOptions.pipe(Schema.withDecodingDefaultTypeKey(Effect.sync(defaultExportOptions))),
})
export type ExportSettings = typeof ExportSettings.Type

export const defaultExportSettings = (): ExportSettings => ({
  format: 'png',
  options: defaultExportOptions(),
  quality: null,
  resizeMethod: 'lanczos3',
  scale: 1,
})

/**
 * True when the encode discards information. PNG never does; WebP and AVIF
 * only when their lossless toggle is on. The dialog hides the quality knob
 * for a lossless encode.
 */
export const isLossy = (settings: Pick<ExportSettings, 'format' | 'options'>): boolean => {
  const { format, options } = settings
  return Match.value(format).pipe(
    Match.when('png', () => false),
    Match.when('jpeg', () => true),
    Match.when('webp', () => !options.webp.lossless),
    Match.when('avif', () => !options.avif.lossless),
    Match.exhaustive,
  )
}

export const mimeFor = (format: ExportFormat): string =>
  Match.value(format).pipe(
    Match.when('png', () => 'image/png'),
    Match.when('jpeg', () => 'image/jpeg'),
    Match.when('webp', () => 'image/webp'),
    Match.when('avif', () => 'image/avif'),
    Match.exhaustive,
  )
