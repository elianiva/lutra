import { Effect } from 'effect'
import { GpuError } from '@lutra/engine'

export const HISTOGRAM_BINS = 256
export const HISTOGRAM_SLOTS = 3

export type SlotState =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Pending'; readonly promise: Promise<void> }

declare const slotBrand: unique symbol
export type HistogramSlot = {
  readonly [slotBrand]?: true
  readonly buffer: GPUBuffer
  state: SlotState
  generation: number
}

export const makeSlot = (buffer: GPUBuffer): HistogramSlot =>
  ({ buffer, generation: 0, state: { _tag: 'Idle' } }) as HistogramSlot

export const isIdle = (slot: HistogramSlot): boolean => slot.state._tag === 'Idle'

export class HistogramRing {
  private cursor = 0

  constructor(readonly slots: readonly HistogramSlot[]) {}

  static create(device: GPUDevice): HistogramRing {
    const slots = Array.from({ length: HISTOGRAM_SLOTS }, () =>
      makeSlot(
        device.createBuffer({
          size: HISTOGRAM_BINS * 4,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
      ),
    )
    return new HistogramRing(slots as unknown as readonly [HistogramSlot, HistogramSlot, HistogramSlot])
  }

  destroy(): void {
    for (const slot of this.slots) {
      slot.buffer.destroy()
    }
  }

  acquire(): Effect.Effect<HistogramSlot> {
    const next = this.slots[this.cursor % HISTOGRAM_SLOTS]!
    this.cursor += 1
    const bump = () => {
      next.generation += 1
    }
    if (next.state._tag === 'Pending') {
      const pending = next.state.promise
      return Effect.gen(function* () {
        yield* Effect.promise(() => pending).pipe(Effect.ignore)
        try {
          next.buffer.unmap()
        } catch (cause) {
          void cause
        }
        next.state = { _tag: 'Idle' }
        bump()
        return next
      })
    }
    bump()
    return Effect.succeed(next)
  }

  occupy(slot: HistogramSlot, promise: Promise<void>): void {
    slot.state = { _tag: 'Pending', promise }
  }

  release(slot: HistogramSlot): void {
    try {
      slot.buffer.unmap()
    } catch (cause) {
      void cause
    }
    slot.state = { _tag: 'Idle' }
  }

  owns(slot: HistogramSlot): boolean {
    return (this.slots as readonly HistogramSlot[]).includes(slot)
  }

  consume(slot: HistogramSlot, expectedGeneration: number): Effect.Effect<Uint32Array<ArrayBuffer>, GpuError> {
    if (slot.state._tag === 'Idle' || !this.owns(slot) || slot.generation !== expectedGeneration) {
      return Effect.succeed(new Uint32Array(HISTOGRAM_BINS))
    }
    const pending = slot.state.promise
    return Effect.gen(function* () {
      yield* Effect.tryPromise({
        catch: (cause) => new GpuError({ cause, message: 'Failed to map histogram bins buffer' }),
        try: async () => await pending,
      })
      const bins = new Uint32Array(slot.buffer.getMappedRange())
      const copy = new Uint32Array(bins)
      try {
        slot.buffer.unmap()
      } catch (cause) {
        void cause
      }
      slot.state = { _tag: 'Idle' }
      return copy
    })
  }
}
