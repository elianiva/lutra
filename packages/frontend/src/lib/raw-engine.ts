import { FlashRaw } from 'flashraw'
import { createWorkerPool } from 'flashraw/worker'

/**
 * What the app needs from a RAW decoder (docs/adr/0008-raw-decode): open a
 * file, read its size, decode it to 8-bit sRGB, pull its embedded JPEG. The
 * seam keeps FlashRaw's worker pool, the tools' inline decoder and test
 * doubles interchangeable.
 */
export interface RawSession {
  /** The sensor image's size after the default crop. */
  readonly size: { readonly width: number; readonly height: number }
  readonly rgba8: (halfSize: boolean) => Promise<RawFrame>
  readonly preview: () => Promise<RawPreview | null>
}

export interface RawFrame {
  readonly data: Uint8ClampedArray<ArrayBuffer>
  readonly width: number
  readonly height: number
}

export interface RawPreview {
  readonly data: Uint8Array<ArrayBuffer>
  readonly mimeType: string
}

export interface RawEngine {
  /** Open `blob`, run `use`, and always close the file again. */
  readonly withSession: <A>(blob: Blob, use: (session: RawSession) => Promise<A>) => Promise<A>
  /** Start the decoder ahead of the first decode. */
  readonly warm: () => void
}

/** The part of FlashRaw's handles (local and worker-pool) the engine reads. */
interface OpenedRaw {
  readonly metadata: { readonly width: number; readonly height: number }
  readonly decode: (options: {
    readonly colorSpace: 'srgb'
    readonly demosaic: 'bilinear' | 'half-size'
    readonly output: 'rgba8'
  }) => Promise<RawFrame>
  readonly preview: () => Promise<RawPreview | null>
  readonly close: () => Promise<void> | void
}

export interface RawPool {
  readonly open: (blob: Blob) => Promise<OpenedRaw>
  readonly getCapabilities: () => Promise<object>
  readonly terminate: () => void
}

const sessionOf = (raw: OpenedRaw): RawSession => ({
  preview: async () => await raw.preview(),
  rgba8: async (halfSize) =>
    await raw.decode({
      colorSpace: 'srgb',
      demosaic: halfSize ? 'half-size' : 'bilinear',
      output: 'rgba8',
    }),
  size: raw.metadata,
})

/** How long an unused pool keeps its worker (and the wasm heap) alive. */
const POOL_IDLE_MS = 30_000

/**
 * A pool of one worker, created on demand and terminated once nothing has
 * used it for `idleMs`, so the wasm heap of a large decode does not live as
 * long as the tab.
 */
export const createPoolEngine = (
  createPool: () => RawPool,
  idleMs: number = POOL_IDLE_MS,
): RawEngine => {
  let pool: RawPool | undefined
  let holds = 0
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const acquire = (): RawPool => {
    clearTimeout(idleTimer)
    holds += 1
    pool ??= createPool()
    return pool
  }

  const release = (): void => {
    holds -= 1
    if (holds === 0) {
      idleTimer = setTimeout(() => {
        pool?.terminate()
        pool = undefined
      }, idleMs)
    }
  }

  return {
    warm: () => {
      const held = acquire()
      void held.getCapabilities().then(release, release)
    },
    withSession: async (blob, use) => {
      const held = acquire()
      try {
        const raw = await held.open(blob)
        try {
          return await use(sessionOf(raw))
        } finally {
          await raw.close()
        }
      } finally {
        release()
      }
    },
  }
}

/** Decodes in the calling thread: for the tools' image workers, which are workers already. */
export const inlineEngine: RawEngine = {
  warm: () => undefined,
  withSession: async (blob, use) => {
    const raw = await FlashRaw.open(blob)
    try {
      return await use(sessionOf(raw))
    } finally {
      raw.close()
    }
  },
}

/** Workers decode inline; the page decodes in a pool worker. */
export const defaultRawEngine = (): RawEngine =>
  'window' in globalThis ? createPoolEngine(() => createWorkerPool({ size: 1 })) : inlineEngine
