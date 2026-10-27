import { beforeEach, describe, expect, it, vi } from 'vitest'

const poolDecode = vi.fn()
vi.mock('flashraw/worker', () => ({
  createWorkerPool: () => ({ decode: poolDecode, terminate: vi.fn() }),
}))

import { decodeImage, isBrowserFormat } from './decode-image'

// decodeImage routes by the bytes' magic number first and the file name
// second, and surfaces the browser decoder's error whichever order ran
// (docs/adr/0008-raw-decode). FlashRaw and createImageBitmap are stubbed: this
// pins the routing, not the decoders.

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const TIFF = [0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const ftyp = (brand: string): number[] => [
  0, 0, 0, 0x18, ...'ftyp'.split('').map((c) => c.charCodeAt(0)),
  ...brand.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0,
]

const bytes = (data: number[]) => new Uint8Array(data)
const browserBitmap = { kind: 'browser' }
const rawBitmap = { kind: 'raw' }
const createImageBitmapMock = vi.fn()
class MockImageData {
  constructor(
    readonly data: unknown,
    readonly width: number,
    readonly height: number,
  ) {}
}

beforeEach(() => {
  poolDecode.mockReset()
  createImageBitmapMock.mockReset()
  vi.stubGlobal('createImageBitmap', createImageBitmapMock)
  vi.stubGlobal('ImageData', MockImageData)
  poolDecode.mockResolvedValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
  createImageBitmapMock.mockImplementation(async (input: unknown) =>
    input instanceof MockImageData ? rawBitmap : browserBitmap,
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
  it('decodes a JPEG with the browser and never loads FlashRaw', async () => {
    const result = await decodeImage(new File([bytes(JPEG)], 'a.jpg'))
    expect(result).toBe(browserBitmap)
    expect(poolDecode).not.toHaveBeenCalled()
  })

  it('tries FlashRaw first for non-browser bytes, even without a file name', async () => {
    const result = await decodeImage(new Blob([bytes(TIFF)]))
    expect(result).toBe(rawBitmap)
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1) // only the ImageData wrap
  })

  it('tries FlashRaw first for a RAW file name, then falls back to the browser', async () => {
    poolDecode.mockRejectedValue(new Error('raw failed'))
    const result = await decodeImage(new File([bytes(JPEG)], 'renamed.dng'))
    expect(poolDecode).toHaveBeenCalledTimes(1)
    expect(result).toBe(browserBitmap)
  })

  it('surfaces the browser error when both decoders fail', async () => {
    poolDecode.mockRejectedValue(new Error('raw failed'))
    createImageBitmapMock.mockRejectedValue(new Error('browser failed'))
    await expect(decodeImage(new Blob([bytes(JPEG)]))).rejects.toThrow('browser failed')
    await expect(decodeImage(new Blob([bytes(TIFF)]))).rejects.toThrow('browser failed')
  })
})
