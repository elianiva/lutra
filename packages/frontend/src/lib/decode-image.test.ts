import { beforeEach, describe, expect, it, vi } from 'vitest'
import { linearSourceOf } from '../gpu/linear-source'
import { createImageDecoder, isBrowserFormat } from './decode-image'
import type { RawEngine, RawPreview, RawSession } from './raw-engine'

// decodeImage routes by the bytes' magic number first and the file name
// second, and surfaces the browser decoder's error whichever order ran
// (docs/adr/0008-raw-decode). The RAW engine and createImageBitmap are
// doubles: this pins the routing, not the decoders.

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const TIFF = [0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const ftyp = (brand: string): number[] => [
  0,
  0,
  0,
  0x18,
  ...'ftyp'.split('').map((c) => c.charCodeAt(0)),
  ...brand.split('').map((c) => c.charCodeAt(0)),
  0,
  0,
  0,
  0,
]

const bytes = (data: number[]) => new Uint8Array(data)

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

const browserBitmap = { kind: 'browser' }
const rawBitmap = { kind: 'raw' }
const createImageBitmapMock = vi.fn<(input: Blob | FakeImageData) => Promise<object>>()

const srgb16 = vi.fn<RawSession['srgb16']>()
const preview = vi.fn<() => Promise<RawPreview | null>>()
const engine: RawEngine = {
  warm: vi.fn(),
  withSession: async (_blob, use) =>
    await use({ preview, srgb16, size: { height: 4000, width: 6000 } }),
}
const { decodeImage, rawPreview } = createImageDecoder(engine)

beforeEach(() => {
  srgb16.mockReset()
  preview.mockReset()
  createImageBitmapMock.mockReset()
  vi.stubGlobal('createImageBitmap', createImageBitmapMock)
  vi.stubGlobal('ImageData', FakeImageData)
  srgb16.mockResolvedValue({ data: new Uint16Array([0, 65535, 0]), height: 1, width: 1 })
  createImageBitmapMock.mockImplementation(async (input) =>
    input instanceof FakeImageData ? rawBitmap : browserBitmap,
  )
})

describe('isBrowserFormat', () => {
  it('accepts browser formats and rejects RAW containers', () => {
    expect(isBrowserFormat(bytes(JPEG))).toBe(true)
    expect(isBrowserFormat(bytes(ftyp('avif')))).toBe(true)
    expect(isBrowserFormat(bytes(ftyp('crx ')))).toBe(false)
    expect(isBrowserFormat(bytes(TIFF))).toBe(false)
  })
})

describe('decodeImage', () => {
  it('decodes a JPEG with the browser and never opens FlashRaw', async () => {
    const result = await decodeImage(new File([bytes(JPEG)], 'a.jpg'))
    expect(result).toBe(browserBitmap)
    expect(srgb16).not.toHaveBeenCalled()
  })

  it('tries FlashRaw first for non-browser bytes, even without a file name', async () => {
    const result = await decodeImage(new Blob([bytes(TIFF)]))
    expect(result).toBe(rawBitmap)
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1) // only the ImageData wrap
  })

  it('tries FlashRaw first for a RAW file name, then falls back to the browser', async () => {
    srgb16.mockRejectedValue(new Error('raw failed'))
    const result = await decodeImage(new File([bytes(JPEG)], 'renamed.dng'))
    expect(srgb16).toHaveBeenCalledTimes(1)
    expect(result).toBe(browserBitmap)
  })

  it('surfaces the browser error when both decoders fail', async () => {
    srgb16.mockRejectedValue(new Error('raw failed'))
    createImageBitmapMock.mockRejectedValue(new Error('browser failed'))
    await expect(decodeImage(new Blob([bytes(JPEG)]))).rejects.toThrow('browser failed')
    await expect(decodeImage(new Blob([bytes(TIFF)]))).rejects.toThrow('browser failed')
  })

  it('uses the half-size demosaic only when the sensor has twice the pixels the caller keeps', async () => {
    const file = new File([bytes(TIFF)], 'a.cr3')
    await decodeImage(file) // no target: full size
    await decodeImage(file, { longEdge: 2048 }) // 6000 >= 4096: half size
    await decodeImage(file, { longEdge: 4000 }) // 6000 < 8000: full size
    expect(srgb16.mock.calls.map(([halfSize]) => halfSize)).toEqual([false, true, false])
  })
})

describe('RAW sources', () => {
  it('attaches the linear half-float pixels to the bitmap, with alpha 1', async () => {
    const result = await decodeImage(new File([bytes(TIFF)], 'a.cr3'))
    // sRGB codes 0 and 65535 are linear 0 and 1: half-float bits 0x0000 and 0x3c00.
    expect(linearSourceOf(result)?.data).toEqual(new Uint16Array([0x0000, 0x3c00, 0x0000, 0x3c00]))
  })

  it('scales the pixels to the target long edge so bitmap and linear data agree', async () => {
    srgb16.mockResolvedValue({ data: new Uint16Array(4 * 2 * 3), height: 2, width: 4 })
    await decodeImage(new File([bytes(TIFF)], 'a.cr3'), { longEdge: 2 })
    const image = createImageBitmapMock.mock.calls
      .map(([input]) => input)
      .find((input) => input instanceof FakeImageData)
    expect(image).toMatchObject({ height: 1, width: 2 })
  })
})

describe('rawPreview', () => {
  it('returns the embedded JPEG, or null when there is none or it is not a JPEG', async () => {
    preview.mockResolvedValueOnce({ data: bytes(JPEG), mimeType: 'image/jpeg' })
    expect((await rawPreview(new Blob([bytes(TIFF)])))?.type).toBe('image/jpeg')
    preview.mockResolvedValueOnce(null)
    expect(await rawPreview(new Blob([bytes(TIFF)]))).toBeNull()
    preview.mockResolvedValueOnce({ data: bytes(JPEG), mimeType: 'image/tiff' })
    expect(await rawPreview(new Blob([bytes(TIFF)]))).toBeNull()
  })
})
