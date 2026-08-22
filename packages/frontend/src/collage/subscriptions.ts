import { Effect, Option, Queue, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { DragAndDrop } from '@foldkit/ui'
import { CellMeasured, GotDragMessage, PanEnded, PanMoved, WheelZoomed } from './message'
import type { Model } from './model'
import type { CollageMessage } from './message'
import { ScreenMode } from './model'

/**
 * The Collage Submodel's subscriptions (docs/adr/0033), lifted into the
 * root's context (docs/adr/0009):
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
  toParentMessage: (message: DragAndDrop.Message): CollageMessage => GotDragMessage({ message }),
})

const own = Subscription.make<Model, CollageMessage>()((entry) => ({
  // Pan tracking lives here, not in view handlers: several pointer events
  // can fire between two renders, and a view closure would gate each one on
  // stale model state. Document-level events flow while a pan gesture is
  // live; update ignores them when no gesture is.
  panTracking: entry(
    { panActive: S.Literals(['idle', 'active']) },
    {
      modelToDependencies: (model: Model) => ({
        panActive: model.pan === null ? 'idle' : 'active',
      }),
      dependenciesToStream: ({ panActive }: { panActive: 'idle' | 'active' }) =>
        Stream.when(
          Subscription.fromEventFilterMap({
            target: (): EventTarget => document,
            type: 'pointermove',
            toMessage: (event: PointerEvent): Option.Option<CollageMessage> =>
              Option.some(PanMoved({ screenX: event.screenX, screenY: event.screenY })),
          }).pipe(
            Stream.merge(
              Subscription.fromEventFilterMap({
                target: (): EventTarget => document,
                type: 'pointerup',
                toMessage: (): Option.Option<CollageMessage> => Option.some(PanEnded()),
              }),
            ),
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
              return Option.some(WheelZoomed({ index, deltaY: event.deltaY }))
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
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  const observer = new ResizeObserver((entries) => {
                    const rect = entries[0]?.contentRect
                    if (rect && rect.width > 0 && rect.height > 0) {
                      Queue.offerUnsafe(
                        queue,
                        CellMeasured({ width: rect.width, height: rect.height }),
                      )
                    }
                  })
                  // Cells are uniform; observing any one measures them all.
                  const el = document.querySelector('[data-collage-cell]')
                  if (el) {
                    observer.observe(el)
                  }
                  return observer
                }),
                (observer) => Effect.sync(() => observer.disconnect()),
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
