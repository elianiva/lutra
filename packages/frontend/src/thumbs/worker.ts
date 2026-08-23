import { applyLutCpu, encodeImage } from '@lutra/engine'
import type { LutCube } from '@lutra/engine'

// The LUT-thumbnail worker. The main thread posts `{ id, image, cube }`; the
// worker applies the cube to the (already downscaled) photo with the engine's
// CPU sampler — the pure-JS mirror of the WGSL LUT pass, exact for a LUT-only
// chain (docs/adr/0002-lut-library) — encodes a small JPEG, and replies `{ id, bytes }`
// (buffer transferred) or `{ id, error }`. Like the encode worker, the thumb
// worker holds no state: the image is structured-cloned per request, which is
// cheap at 200×200 (160KB).
//
// The JPEG step reuses the engine's `encodeImage` with export settings — the
// jSquash codecs stay engine-owned (docs/adr/0004-export).

export interface LutThumbRequest {
  readonly id: number
  readonly image: ImageData
  readonly cube: LutCube
}

export interface LutThumbResponse {
  readonly id: number
  readonly bytes?: Uint8Array
  readonly error?: string
}

// The DOM lib types `self.postMessage` for windows (targetOrigin arg); a
// worker's postMessage takes a transfer list. Narrow the global here.
// SAFETY: this file only runs inside a dedicated worker, where postMessage accepts a transfer list.
// oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
const ctx = self as {
  postMessage(message: LutThumbResponse, transfer?: Transferable[]): void
}

self.onmessage = (event: MessageEvent<LutThumbRequest>) => {
  const { id, image, cube } = event.data
  // The sampler is synchronous; the encode is async (jSquash wasm).
  let graded: ImageData
  try {
    graded = applyLutCpu(image, cube, 1)
  } catch (error) {
    ctx.postMessage({
      error: error instanceof Error ? error.message : String(error),
      id,
    })
    return
  }
  encodeImage(graded, { format: 'jpeg', quality: 85, scale: 1 })
    .then((bytes) => {
      ctx.postMessage({ bytes, id }, [bytes.buffer])
    })
    .catch((error) => {
      ctx.postMessage({
        error: error instanceof Error ? error.message : String(error),
        id,
      })
    })
}
