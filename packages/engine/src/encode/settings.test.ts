import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { Schema } from 'effect'
import {
  EXPORT_FORMATS,
  RESIZE_METHODS,
  ExportSettings,
  defaultExportOptions,
  defaultExportSettings,
  isLossy,
  mimeFor,
} from './settings'
import type { ExportOptions, ExportSettings as Settings } from './settings'

const formatArb = fc.constantFrom(...EXPORT_FORMATS)
const qualityArb = fc.oneof(fc.constant(null), fc.integer({ max: 100, min: 0 }))
const scaleArb = fc.double({ max: 1, min: 0.01, noNaN: true })

const optionsArb: fc.Arbitrary<ExportOptions> = fc.record({
  avif: fc.record({
    lossless: fc.boolean(),
    speed: fc.integer({ max: 10, min: 0 }),
  }),
  jpeg: fc.record({
    optimizeCoding: fc.boolean(),
    progressive: fc.boolean(),
    smoothing: fc.integer({ max: 100, min: 0 }),
  }),
  webp: fc.record({
    effort: fc.integer({ max: 6, min: 0 }),
    lossless: fc.boolean(),
  }),
})

/** Any payload the schema accepts. */
const validSettingsArb: fc.Arbitrary<Settings> = fc.record({
  format: formatArb,
  options: optionsArb,
  quality: qualityArb,
  resizeMethod: fc.constantFrom(...RESIZE_METHODS),
  scale: scaleArb,
})

describe('ExportSettings', () => {
  it('round-trips any valid settings object', () => {
    fc.assert(
      fc.property(validSettingsArb, (settings) => {
        expect(Schema.decodeSync(ExportSettings)(settings)).toEqual(settings)
      }),
    )
  })

  it('decodes the defaults and they are a valid settings object', () => {
    fc.assert(
      fc.property(fc.constant(defaultExportSettings()), (defaults) => {
        expect(Schema.decodeSync(ExportSettings)(defaults)).toEqual(defaults)
      }),
    )
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

  it('rejects any out-of-range quality', () => {
    fc.assert(
      fc.property(
        fc.record({
          format: formatArb,
          options: optionsArb,
          quality: fc.oneof(
            fc.integer({ max: -1, min: -1000 }),
            fc.integer({ max: 1000, min: 101 }),
            fc.string(),
          ),
          resizeMethod: fc.constantFrom(...RESIZE_METHODS),
          scale: scaleArb,
        }),
        (settings) => {
          expect(() => Schema.decodeUnknownSync(ExportSettings)(settings)).toThrow()
        },
      ),
    )
  })

  it('rejects any unknown format', () => {
    const formatNames: readonly string[] = EXPORT_FORMATS
    fc.assert(
      fc.property(
        fc.string({ maxLength: 12, minLength: 1 }).filter((s) => !formatNames.includes(s)),
        (format) => {
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
      ),
    )
  })

  it('rejects any scale outside [0.01, 1] — no upscaling and a sane floor', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ max: 0 }),
          fc.double({ max: 0.009_999, min: 0.000_001 }),
          fc.double({ min: 1.000_001 }),
        ),
        (scale) => {
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
      ),
    )
  })

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

  it('rejects payloads missing a required field', () => {
    fc.assert(
      fc.property(
        validSettingsArb.chain((settings) =>
          fc.constantFrom(
            { quality: settings.quality, scale: settings.scale },
            { format: settings.format, scale: settings.scale },
            { format: settings.format, quality: settings.quality },
          ),
        ),
        (settings) => {
          expect(() => Schema.decodeUnknownSync(ExportSettings)(settings)).toThrow()
        },
      ),
    )
  })
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

  it('mimeFor maps each format to its MIME type', () => {
    fc.assert(
      fc.property(formatArb, (format) => {
        expect(mimeFor(format)).toBe(`image/${format}`)
      }),
    )
  })
})
