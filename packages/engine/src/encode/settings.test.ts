import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { Schema } from 'effect'
import {
  EXPORT_FORMATS,
  EXPORT_SCALES,
  ExportSettings,
  defaultExportSettings,
  isLossy,
  fileExtension,
  mimeFor,
} from './settings'

// ---- generators ----

const formatArb = fc.constantFrom(...EXPORT_FORMATS)
const scaleArb = fc.constantFrom(...EXPORT_SCALES)
const qualityArb = fc.oneof(fc.constant(null), fc.integer({ max: 100, min: 0 }))

/** Any payload the schema accepts. */
const validSettingsArb = fc.record({
  format: formatArb,
  quality: qualityArb,
  scale: scaleArb,
})

// ---- tests ----

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

  it('rejects any out-of-range quality', () => {
    fc.assert(
      fc.property(
        fc.record({
          format: formatArb,
          // Just outside the [0, 100] window, and a non-number quality.
          quality: fc.oneof(
            fc.integer({ max: -1, min: -1000 }),
            fc.integer({ max: 1000, min: 101 }),
            fc.string(),
          ),
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
            Schema.decodeUnknownSync(ExportSettings)({ format, quality: null, scale: 1 }),
          ).toThrow()
        },
      ),
    )
  })

  it('rejects any scale outside the presets', () => {
    const scaleNames: readonly number[] = EXPORT_SCALES
    fc.assert(
      fc.property(
        fc.double().filter((n) => !scaleNames.includes(n)),
        (scale) => {
          expect(() =>
            Schema.decodeUnknownSync(ExportSettings)({ format: 'png', quality: null, scale }),
          ).toThrow()
        },
      ),
    )
  })

  it('rejects payloads missing required fields', () => {
    fc.assert(
      fc.property(
        fc
          .record({ format: formatArb, quality: qualityArb, scale: scaleArb })
          // Drop one required field at a time.
          .chain((settings) =>
            fc.constantFrom(
              { format: settings.format, quality: settings.quality },
              { format: settings.format, scale: settings.scale },
              { quality: settings.quality, scale: settings.scale },
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
  it('isLossy flags everything but PNG', () => {
    fc.assert(
      fc.property(formatArb, (format) => {
        expect(isLossy(format)).toBe(format !== 'png')
      }),
    )
  })

  it('fileExtension matches the format name', () => {
    fc.assert(
      fc.property(formatArb, (format) => {
        expect(fileExtension(format)).toBe(format)
      }),
    )
  })

  it('mimeFor maps each format to its MIME type', () => {
    fc.assert(
      fc.property(formatArb, (format) => {
        expect(mimeFor(format)).toBe(`image/${format}`)
      }),
    )
  })
})
