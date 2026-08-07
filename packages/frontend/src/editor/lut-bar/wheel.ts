import { Effect } from 'effect'
import { Mount } from 'foldkit'
import { asHtmlElement } from '../canvas-stage'
import { LutStripWheelRegistered } from '../message'

/**
 * One-shot mount on the filmstrip: normalizes wheel deltas exactly like the
 * stage's PanZoom (trackpads report pixels, mice lines, some devices pages)
 * and scrolls the strip horizontally — the vertical wheel gesture maps to
 * strip scrolling, the filmstrip's whole job being browsing a wide row of
 * thumbnails under the canvas. The listener lives for the element's
 * lifetime (the mount's scope finalizer); the ack message exists for
 * DevTools/Scene observability, like CanvasRegistered.
 */
export const LutStripWheel = Mount.define(
  'LutStripWheel',
  LutStripWheelRegistered,
)((element) =>
  Effect.gen(function* () {
    const strip = asHtmlElement(element)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? e.deltaY * 16
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? e.deltaY * 100
            : e.deltaY
      strip.scrollLeft += delta
    }
    yield* Effect.acquireRelease(
      Effect.sync(() => strip.addEventListener('wheel', onWheel, { passive: false })),
      () => Effect.sync(() => strip.removeEventListener('wheel', onWheel)),
    )
    return LutStripWheelRegistered()
  }),
)
