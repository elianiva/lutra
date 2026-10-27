import { Context, Effect, Layer, Queue } from 'effect'
import { ProcessError } from './protocol'
import type { Job, Output, Reply } from './protocol'

/**
 * A fixed pool of image workers. A job takes an idle worker from the queue and
 * gives it back when it settles, so memory stays bounded to `size` decoded
 * photos at once and extra jobs wait their turn.
 */
export class ImageWorkers extends Context.Service<
  ImageWorkers,
  Readonly<{ run: (job: Job) => Effect.Effect<Output, ProcessError> }>
>()('ImageWorkers') {}

/** Each worker can hold a decoded 24 MP frame, so stay modest. */
const poolSize = () => Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1))

const spawn = () => new Worker(new URL('worker.ts', import.meta.url), { type: 'module' })

const runOn = (worker: Worker, job: Job): Effect.Effect<Output, ProcessError> =>
  Effect.callback<Output, ProcessError>((resume) => {
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data
      resume(
        reply.ok
          ? Effect.succeed(reply.output)
          : Effect.fail(new ProcessError({ message: reply.error })),
      )
    }
    worker.onerror = (event) => {
      event.preventDefault()
      resume(Effect.fail(new ProcessError({ message: event.message || 'Image worker failed' })))
    }
    worker.postMessage(job)
  })

export const ImageWorkersLive = Layer.effect(
  ImageWorkers,
  Effect.gen(function* () {
    const idle = yield* Queue.unbounded<Worker>()
    for (let index = 0; index < poolSize(); index += 1) {
      const worker = yield* Effect.acquireRelease(Effect.sync(spawn), (worker) =>
        Effect.sync(() => worker.terminate()),
      )
      yield* Queue.offer(idle, worker)
    }
    return ImageWorkers.of({
      run: (job) =>
        Effect.acquireUseRelease(
          Queue.take(idle),
          (worker) => runOn(worker, job),
          (worker) => Queue.offer(idle, worker),
        ),
    })
  }),
)
