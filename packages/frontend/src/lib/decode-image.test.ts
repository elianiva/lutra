import { beforeEach, describe, expect, it, vi } from 'vitest'

const { poolDecode, poolPreview, poolTerminate, createWorkerPool } = vi.hoisted(() => {
  const decode = vi.fn()
  const preview = vi.fn()
  const terminate = vi.fn()
  return {
    createWorkerPool: vi.fn(() => ({
      open: async () => ({ close: vi.fn(), decode, preview }),
      terminate,
    })),
    poolDecode: decode,
    poolPreview: preview,
    poolTerminate: terminate,
  }
})
vi.mock('flashraw/worker', () => ({ createWorkerPool }))

import { decodeImage, isBrowserFormat, rawPreview } from './decode-image'

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
  poolPreview.mockReset()
  poolTerminate.mockReset()
  createWorkerPool.mockClear()
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

describe('rawPreview', () => {
  it('returns the embedded JPEG, or null when there is none or it is not a JPEG', async () => {
    poolPreview.mockResolvedValueOnce({ data: bytes(JPEG), mimeType: 'image/jpeg' })
    expect((await rawPreview(new Blob([bytes(TIFF)])))?.type).toBe('image/jpeg')
    poolPreview.mockResolvedValueOnce(null)
    expect(await rawPreview(new Blob([bytes(TIFF)]))).toBeNull()
    poolPreview.mockResolvedValueOnce({ data: bytes(JPEG), mimeType: 'image/tiff' })
    expect(await rawPreview(new Blob([bytes(TIFF)]))).toBeNull()
  })
})

describe('worker pool lifetime', () => {
  it('terminates the pool after it has been idle and builds a fresh one on the next decode', async () => {
    // A fresh module: earlier tests left a pool (and its idle timer) behind.
    vi.resetModules()
    const { decodeImage: freshDecodeImage } = await import('./decode-image')
    vi.useFakeTimers()
    try {
      await freshDecodeImage(new Blob([bytes(TIFF)]))
      await freshDecodeImage(new Blob([bytes(TIFF)]))
      expect(createWorkerPool).toHaveBeenCalledTimes(1)
      expect(poolTerminate).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(30_000)
      expect(poolTerminate).toHaveBeenCalledTimes(1)

      await freshDecodeImage(new Blob([bytes(TIFF)]))
      expect(createWorkerPool).toHaveBeenCalledTimes(2)
    } finally {
      await vi.runAllTimersAsync()
      vi.useRealTimers()
    }
  })
})
