import { process } from './process'
import type { Job, Reply } from './protocol'

// One image worker. The pool posts a `Job`; this runs the pipeline and replies
// with the encoded bytes (buffer transferred) or the error message.

// SAFETY: this file only runs inside a dedicated worker, where postMessage accepts a transfer list.
// oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
const ctx = self as { postMessage(message: Reply, transfer?: Transferable[]): void }

self.onmessage = (event: MessageEvent<Job>) => {
  process(event.data)
    .then((output) => {
      ctx.postMessage({ ok: true, output }, [output.bytes.buffer])
    })
    .catch((error) => {
      ctx.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
    })
}
