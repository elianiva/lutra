import { Match, Schema } from 'effect'

export const EXPORT_FORMATS = ['png', 'jpeg', 'webp', 'avif'] as const

export const ExportFormat = Schema.Literals(EXPORT_FORMATS)
export type ExportFormat = typeof ExportFormat.Type

export const ExportQuality = Schema.Number.pipe(
  Schema.check(Schema.isBetween({ maximum: 100, minimum: 0 })),
)
export type ExportQuality = typeof ExportQuality.Type

/**
 * The resolution presets the export dialog offers, in display order. A
 * literal union, not a free number: export is a preset scale of the rendered
 * frame, never an upscale (see docs/adr/0004-export.md).
 */
export const EXPORT_SCALES = [1, 0.75, 0.5, 0.25] as const
export const ExportScale = Schema.Literals(EXPORT_SCALES)
export type ExportScale = typeof ExportScale.Type

/**
 * User-facing export settings. Crosses the message boundary as validated
 * data and persists across sessions. `quality` is `null` only for PNG
 * (lossless); switching to a lossy format fills the default.
 */
export const ExportSettings = Schema.Struct({
  format: ExportFormat,
  quality: Schema.NullOr(ExportQuality),
  scale: ExportScale,
})
export type ExportSettings = typeof ExportSettings.Type

export const defaultExportSettings = (): ExportSettings => ({
  format: 'png',
  quality: null,
  scale: 1,
})

export const isLossy = (format: ExportFormat) => format !== 'png'

export const mimeFor = (format: ExportFormat): string =>
  Match.value(format).pipe(
    Match.when('png', () => 'image/png'),
    Match.when('jpeg', () => 'image/jpeg'),
    Match.when('webp', () => 'image/webp'),
    Match.when('avif', () => 'image/avif'),
    Match.exhaustive,
  )
