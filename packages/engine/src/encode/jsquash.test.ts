import { beforeAll, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import * as Webp from '@jsquash/webp/encode.js'
import * as Avif from '@jsquash/avif/encode.js'
import { encodeImage } from './jsquash'
import { EXPORT_SCALES, type ExportSettings } from './settings'

const require = createRequire(import.meta.url)

const compileWasm = async (pkg: string, rel: string): Promise<WebAssembly.Module> =>
  WebAssembly.compile(await readFile(require.resolve(`${pkg}/${rel}`)))

/**
 * Pre-init the emscripten codecs (webp/avif): their node branch cannot
 * fetch wasm (no readBinary), so compile the codec binary and hand the
 * module to `init`. The webp glue picks its simd build via
 * wasm-feature-detect, so compile the simd binary first and fall back to
 * the scalar one — compile fails on runtimes without simd, which is the
 * same check the glue makes.
 */
const initEmscriptenCodecs = async (): Promise<void> => {
  let webpModule: WebAssembly.Module
  try {
    webpModule = await compileWasm('@jsquash/webp', 'codec/enc/webp_enc_simd.wasm')
  } catch {
    webpModule = await compileWasm('@jsquash/webp', 'codec/enc/webp_enc.wasm')
  }
  await Webp.init(webpModule)
  await Avif.init(await compileWasm('@jsquash/avif', 'codec/enc/avif_enc.wasm'))
}

/** A 64×48 gradient image exercising all channels. */
const makeImage = (width = 64, height = 48): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i * 3) % 256
    data[i * 4 + 1] = (i * 7) % 256
    data[i * 4 + 2] = (i * 11) % 256
    data[i * 4 + 3] = 255
  }
  return new ImageData(data, width, height)
}

const settings = (
  format: ExportSettings['format'],
  overrides: Partial<ExportSettings> = {},
): ExportSettings =>
  // The spread of Partial overrides widens the literal; the cast is the
  // deliberate escape hatch for the test's convenience.
  // oxlint-disable-next-line consistent-type-assertions
  ({ format, quality: 75, scale: 1, ...overrides }) as ExportSettings

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('encodeImage', () => {
  beforeAll(initEmscriptenCodecs)
  it('encodes PNG (lossless, no quality knob)', async () => {
    const bytes = await encodeImage(makeImage(), settings('png', { quality: null }))
    expect([...bytes.subarray(0, 8)]).toEqual(PNG_MAGIC)
  })

  it('encodes JPEG', async () => {
    const bytes = await encodeImage(makeImage(), settings('jpeg'))
    expect(bytes[0]).toBe(0xff)
    expect(bytes[1]).toBe(0xd8)
  })

  it('encodes WebP', async () => {
    const bytes = await encodeImage(makeImage(), settings('webp'))
    expect([...bytes.subarray(0, 4)]).toEqual([0x52, 0x49, 0x46, 0x46]) // RIFF
    expect([...bytes.subarray(8, 12)]).toEqual([0x57, 0x45, 0x42, 0x50]) // WEBP
  })

  it('encodes AVIF', async () => {
    const bytes = await encodeImage(makeImage(), settings('avif'))
    // ISO-BMFF: size + 'ftyp' box.
    expect([...bytes.subarray(4, 8)]).toEqual([0x66, 0x74, 0x79, 0x70])
  })

  it('downscales before encoding: the output dimensions are the rounded scale', async () => {
    // PNG is lossless, so the IHDR header reports the exact canvas the
    // codec was handed: the wrapper's resize target
    // (max(1, round(dim × scale))) must be what the encoder sees.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 192 }),
        fc.integer({ min: 1, max: 192 }),
        fc.constantFrom(...EXPORT_SCALES),
        async (width, height, scale) => {
          const bytes = await encodeImage(
            makeImage(width, height),
            settings('png', { quality: null, scale }),
          )
          // PNG IHDR: width at offset 16, height at offset 20 (big-endian).
          const u32be = (offset: number) =>
            (bytes[offset]! << 24) |
            (bytes[offset + 1]! << 16) |
            (bytes[offset + 2]! << 8) |
            bytes[offset + 3]!
          expect([u32be(16), u32be(20)]).toEqual([
            Math.max(1, Math.round(width * scale)),
            Math.max(1, Math.round(height * scale)),
          ])
        },
      ),
      { numRuns: 12 },
    )
  })
})
