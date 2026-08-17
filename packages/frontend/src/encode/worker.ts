import { encodeImage } from '@lutra/engine'
import type { ExportSettings } from '@lutra/engine'

// The encode worker. The main thread posts `{ id, image, settings }`; this
// runs the engine's pure jSquash encode and replies `{ id, bytes }` (buffer
// transferred) or `{ id, error }`. The worker holds no state — the image is
// structured-cloned per request, which costs far less than the encode itself
// (a 12MP AVIF encode takes seconds).

export interface EncodeRequest {
  readonly id: number
  readonly image: ImageData
  readonly settings: ExportSettings
}

export interface EncodeResponse {
  readonly id: number
  readonly bytes?: Uint8Array
  readonly error?: string
}

// The DOM lib types `self.postMessage` for windows (targetOrigin arg); a
// worker's postMessage takes a transfer list. Narrow the global here.
// SAFETY: this file only runs inside a dedicated worker, where postMessage accepts a transfer list.
// oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
const ctx = self as {
  postMessage(message: EncodeResponse, transfer?: Transferable[]): void
}

self.onmessage = (event: MessageEvent<EncodeRequest>) => {
  const { id, image, settings } = event.data
  encodeImage(image, settings)
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
