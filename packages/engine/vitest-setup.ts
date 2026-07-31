import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Node has no `ImageData` global (browser API). The jSquash codecs read
// `.data/.width/.height` and construct `ImageData` internally (e.g. resize
// returns one), so the engine's encode tests run against this minimal shim.
class TestImageData {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}

// oxlint-disable-next-line consistent-type-assertions
globalThis.ImageData = TestImageData as unknown as typeof ImageData

// The emscripten wasm glue loads its codec via
// `fetch(new URL('*.wasm', import.meta.url))` — a `file://` URL in node,
// which undici's fetch does not implement. Serve those from disk.
const originalFetch = globalThis.fetch
const filePathOf = (input: RequestInfo | URL): string | null => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : null
  return href?.startsWith('file:') ? fileURLToPath(href) : null
}
const fileFetch = (input: RequestInfo | URL): Promise<Response> => {
  const path = filePathOf(input)
  if (path !== null) {
    return readFile(path).then(
      (buffer) =>
        new Response(buffer, {
          headers: { 'Content-Type': 'application/wasm' },
        }),
    )
  }
  return originalFetch(input)
}

globalThis.fetch = fileFetch
