import { Effect, Option, Queue, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'
import * as DragAndDrop from '@/components/ui/drag-and-drop'
import { CollageMessage } from './message'
import type { Model } from './model'
import { ScreenMode } from './model'

type CoalescedLike = {
  screenX: number
  screenY: number
  getCoalescedEvents?: () => readonly PointerEvent[]
}

const coalescedPointerSource = (event: PointerEvent): PointerEvent => {
  const candidate: CoalescedLike = event
  return candidate.getCoalescedEvents?.().at(-1) ?? event
}

/**
 * The Collage Submodel's subscriptions (docs/adr/0009-collage), lifted into the
 * root's context (docs/adr/0006-frontend-architecture):
 *
 * - `documentPointer` / `documentEscape` / `documentKeyboard` / `autoScroll`
 *   — the shared drag-and-drop machine's listeners, the reorder gesture's
 *   engine, translated across the `GotCollageMessage(GotDragMessage)` seam.
 * - `wheelZoom` — wheel events over a tile while Frame mode is active, with
 *   `preventDefault` applied synchronously so zooming never scrolls the page.
 *   Gated on the mode dependency: Arrange mode costs nothing.
 * - `cellSize` — a ResizeObserver on the first preview cell while Frame mode
 *   is active; pan math converts pointer deltas into cell fractions, which
 *   needs the cell's CSS-pixel size.
 */

const liftedDnd = Subscription.lift(DragAndDrop.subscriptions)({
  toChildModel: (model: Model) => model.drag,
  toParentMessage: (message: DragAndDrop.Message): CollageMessage =>
    CollageMessage.GotDragMessage({ message }),
})

const own = Subscription.make<Model, CollageMessage>()((entry) => ({
  // Pan tracking lives here, not in view handlers: several pointer events
  // can fire between two renders, and a view closure would gate each one on
  // stale model state. Document-level events flow while a pan gesture is
  // live; update ignores them when no gesture is.
  //
  // High-frequency pointer moves are coalesced to at most one PanMoved per
  // animation frame via rAF batching and PointerEvent.getCoalescedEvents()
  // — without this, every native pointermove (120+ Hz) would trigger a full
  // VDOM diff, causing the 300ms setTimeout violations seen during framing
  // drags. rAF batching keeps the update/view/patch cycle at 60Hz max.
  panTracking: entry(
    { panActive: S.Literals(['idle', 'active']) },
    {
      modelToDependencies: (model: Model) => ({
        panActive: model.pan === null ? 'idle' : 'active',
      }),
      dependenciesToStream: ({ panActive }: { panActive: 'idle' | 'active' }) =>
        Stream.when(
          Stream.callback<CollageMessage>((queue) =>
            Effect.gen(function* () {
              let pending: { screenX: number; screenY: number } | null = null
              let pendingUp = false
              let raf = 0
              const flush = () => {
                raf = 0
                if (pending) {
                  const move = pending
                  pending = null
                  Queue.offerUnsafe(queue, CollageMessage.PanMoved(move))
                }
                if (pendingUp) {
                  pendingUp = false
                  Queue.offerUnsafe(queue, CollageMessage.PanEnded())
                }
              }
              const onMove = (event: PointerEvent) => {
                const source = coalescedPointerSource(event)
                pending = { screenX: source.screenX, screenY: source.screenY }
                if (raf === 0) raf = requestAnimationFrame(flush)
              }
              const onUp = () => {
                pendingUp = true
                if (raf === 0) raf = requestAnimationFrame(flush)
              }
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  document.addEventListener('pointermove', onMove)
                  document.addEventListener('pointerup', onUp)
                  document.addEventListener('pointercancel', onUp)
                  return { onMove, onUp }
                }),
                ({ onMove, onUp }) =>
                  Effect.sync(() => {
                    document.removeEventListener('pointermove', onMove)
                    document.removeEventListener('pointerup', onUp)
                    document.removeEventListener('pointercancel', onUp)
                    if (raf !== 0) cancelAnimationFrame(raf)
                  }),
              )
              return yield* Effect.never
            }),
          ),
          Effect.sync(() => panActive === 'active'),
        ),
    },
  ),
  wheelZoom: entry(
    { mode: ScreenMode },
    {
      modelToDependencies: (model: Model) => ({ mode: model.mode }),
      dependenciesToStream: ({ mode }: { mode: 'arrange' | 'frame' }) =>
        Stream.when(
          Subscription.fromEventFilterMap({
            target: (): EventTarget => document,
            type: 'wheel',
            // Wheel listeners are passive by default; preventDefault needs an
            // explicitly non-passive one.
            options: { passive: false },
            toMessage: (event: WheelEvent): Option.Option<CollageMessage> => {
              const tile =
                event.target instanceof Element ? event.target.closest('[data-collage-tile]') : null
              const index = Number(tile?.getAttribute('data-collage-tile'))
              if (!tile || !Number.isInteger(index)) {
                return Option.none()
              }
              event.preventDefault()
              return Option.some(CollageMessage.WheelZoomed({ index, deltaY: event.deltaY }))
            },
          }),
          Effect.sync(() => mode === 'frame'),
        ),
    },
  ),
  cellSize: entry(
    { mode: ScreenMode },
    {
      modelToDependencies: (model: Model) => ({ mode: model.mode }),
      dependenciesToStream: ({ mode }: { mode: 'arrange' | 'frame' }) =>
        Stream.when(
          Stream.callback<CollageMessage>((queue) =>
            Effect.gen(function* watchCell() {
              let observer: ResizeObserver | null = null
              let raf = 0
              let observedEl: Element | null = null
              const resync = () => {
                const el = document.querySelector('[data-collage-cell]')
                if (el !== observedEl) {
                  if (observedEl && observer) observer.unobserve(observedEl)
                  observedEl = el
                  if (el && observer) observer.observe(el)
                }
                raf = requestAnimationFrame(resync)
              }
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  observer = new ResizeObserver((entries) => {
                    const rect = entries[0]?.contentRect
                    if (rect && rect.width > 0 && rect.height > 0) {
                      Queue.offerUnsafe(
                        queue,
                        CollageMessage.CellMeasured({ width: rect.width, height: rect.height }),
                      )
                    }
                  })
                  raf = requestAnimationFrame(resync)
                  return { observer }
                }),
                ({ observer }) =>
                  Effect.sync(() => {
                    cancelAnimationFrame(raf)
                    observer.disconnect()
                  }),
              )
              return yield* Effect.never
            }),
          ),
          Effect.sync(() => mode === 'frame'),
        ),
    },
  ),
}))

export const subscriptions = Subscription.aggregate<Model, CollageMessage>()(liftedDnd, own)
