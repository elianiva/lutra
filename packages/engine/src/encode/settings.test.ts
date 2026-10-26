import { describe, expect } from 'vitest'
import { it } from '@effect/vitest'
import { Arbitrary, Schema } from 'effect'
import {
  EXPORT_FORMATS,
  RESIZE_METHODS,
  ExportSettings,
  defaultExportOptions,
  defaultExportSettings,
  isLossy,
  mimeFor,
} from './settings'

// Property tests derive their inputs from Effect Schemas and generate through
// Effect's `Arbitrary` (docs/adr/0012-property-testing).

const Format = Schema.Literals(EXPORT_FORMATS)
/** The format names as plain strings: the generator excludes them by name. */
const FORMAT_NAMES: ReadonlyArray<string> = EXPORT_FORMATS
const ResizeMethodSchema = Schema.Literals(RESIZE_METHODS)
const Quality = Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })))
const Scale = Schema.Finite.check(Schema.isBetween({ minimum: 0.01, maximum: 1 }))

/** Any settings payload the schema accepts. */
const ValidSettings = Schema.Struct({
  format: Format,
  options: Schema.Struct({
    avif: Schema.Struct({
      lossless: Schema.Boolean,
      speed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 })),
    }),
    jpeg: Schema.Struct({
      optimizeCoding: Schema.Boolean,
      progressive: Schema.Boolean,
      smoothing: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
    }),
    webp: Schema.Struct({
      effort: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })),
      lossless: Schema.Boolean,
    }),
  }),
  quality: Quality,
  resizeMethod: ResizeMethodSchema,
  scale: Scale,
})

describe('ExportSettings', () => {
  it.prop('round-trips any valid settings object', { settings: ValidSettings }, ({ settings }) => {
    expect(Schema.decodeSync(ExportSettings)(settings)).toEqual(settings)
  })

  it('decodes the defaults and they are a valid settings object', () => {
    const defaults = defaultExportSettings()
    expect(Schema.decodeSync(ExportSettings)(defaults)).toEqual(defaults)
  })

  it('fills the defaults for a legacy record written before sizes and codec options existed', () => {
    const decoded = Schema.decodeSync(ExportSettings)({ format: 'jpeg', quality: 80, scale: 0.5 })
    expect(decoded).toEqual({
      format: 'jpeg',
      options: defaultExportOptions(),
      quality: 80,
      resizeMethod: 'lanczos3',
      scale: 0.5,
    })
  })

  it.prop(
    'rejects any out-of-range quality',
    {
      case: Arbitrary.flatMap(Arbitrary.schema(ValidSettings), (settings) =>
        Arbitrary.map(
          Arbitrary.schema(
            Schema.Union([
              Schema.Int.check(Schema.isLessThan(-1)),
              Schema.Int.check(Schema.isGreaterThan(100)),
              Schema.String,
            ]),
          ),
          (quality) => ({ settings, quality }),
        ),
      ),
    },
    ({ case: { settings, quality } }) => {
      expect(() => Schema.decodeUnknownSync(ExportSettings)({ ...settings, quality })).toThrow()
    },
  )

  it.prop(
    'rejects any unknown format',
    {
      format: Arbitrary.filter(
        Arbitrary.schema(Schema.String.check(Schema.isMinLength(1))),
        (name) => !FORMAT_NAMES.includes(name),
      ),
    },
    ({ format }) => {
      expect(() =>
        Schema.decodeUnknownSync(ExportSettings)({
          format,
          options: defaultExportOptions(),
          quality: null,
          resizeMethod: 'lanczos3',
          scale: 1,
        }),
      ).toThrow()
    },
  )

  it.prop(
    'rejects any scale outside [0.01, 1] — no upscaling and a sane floor',
    {
      scale: Schema.Union([
        Schema.Finite.check(Schema.isLessThanOrEqualTo(0)),
        Schema.Finite.check(Schema.isBetween({ minimum: 0.000_001, maximum: 0.009_999 })),
        Schema.Finite.check(Schema.isGreaterThanOrEqualTo(1.000_001)),
      ]),
    },
    ({ scale }) => {
      expect(() =>
        Schema.decodeUnknownSync(ExportSettings)({
          format: 'png',
          options: defaultExportOptions(),
          quality: null,
          resizeMethod: 'lanczos3',
          scale,
        }),
      ).toThrow()
    },
  )

  it('keeps a quality alongside a lossless WebP/AVIF so a toggle-off restores it', () => {
    const decoded = Schema.decodeSync(ExportSettings)({
      format: 'webp',
      options: { ...defaultExportOptions(), webp: { effort: 4, lossless: true } },
      quality: 90,
      resizeMethod: 'lanczos3',
      scale: 1,
    })
    expect(decoded.quality).toBe(90)
  })

  it.prop(
    'rejects payloads missing a required field',
    {
      case: Arbitrary.flatMap(Arbitrary.schema(ValidSettings), (settings) =>
        Arbitrary.map(
          Arbitrary.schema(Schema.Literals(['format', 'quality', 'scale'])),
          (missing) => {
            switch (missing) {
              case 'format': {
                return { quality: settings.quality, scale: settings.scale }
              }
              case 'quality': {
                return { format: settings.format, scale: settings.scale }
              }
              case 'scale': {
                return { format: settings.format, quality: settings.quality }
              }
            }
          },
        ),
      ),
    },
    ({ case: payload }) => {
      expect(() => Schema.decodeUnknownSync(ExportSettings)(payload)).toThrow()
    },
  )
})

describe('format helpers', () => {
  it('isLossy is false for PNG, true for JPEG, and follows the lossless toggles', () => {
    expect(isLossy({ format: 'png', options: defaultExportOptions() })).toBe(false)
    expect(isLossy({ format: 'jpeg', options: defaultExportOptions() })).toBe(true)

    const lossless = defaultExportOptions()
    expect(
      isLossy({ format: 'webp', options: { ...lossless, webp: { effort: 4, lossless: true } } }),
    ).toBe(false)
    expect(
      isLossy({ format: 'avif', options: { ...lossless, avif: { lossless: true, speed: 6 } } }),
    ).toBe(false)
    expect(isLossy({ format: 'webp', options: lossless })).toBe(true)
    expect(isLossy({ format: 'avif', options: lossless })).toBe(true)
  })

  it.prop('mimeFor maps each format to its MIME type', { format: Format }, ({ format }) => {
    expect(mimeFor(format)).toBe(`image/${format}`)
  })
})
