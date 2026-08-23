import { Effect, Queue, Stream } from 'effect'
import { Mount } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { RotateCcw } from 'lucide'
import { icon } from '../components/icon'
import { curvePointsOf, isCurveNeutral } from '@lutra/engine'
import type { Layer } from '@lutra/engine'
import { EditorMessage } from './message'

// The Tone Curve widget (docs/adr/0028): the drawer's curve editor for a
// toneCurve draft or focused chain layer. A square-ish SVG plot in unit
// space (0..1 both axes, y up) draws the identity diagonal as a dashed
// reference, the piecewise-linear curve through the layer's 5 control
// points (the exact polyline the shader evaluates — WYSIWYG), and one
// draggable handle per point. A reset button appears next to the label
// while the curve diverges from identity (the slider-reset convention,
// docs/adr/0019, applied to the curve as a whole).

/** Content margin in viewBox units — the corner handles (anchors at the
 *  curve's ends) would otherwise clip against the svg bounds. */
const CURVE_MARGIN = 6
/** The viewBox side (unit square). */
const CURVE_VIEW = 100
/** Grab radius around a handle (client px) that starts a drag. */
const GRAB_THRESHOLD = 24

/** Map a unit-space coordinate (0..1, y up) into viewBox space (y down). */
const toView = (v: number) => CURVE_MARGIN + v * (CURVE_VIEW - 2 * CURVE_MARGIN)
const yToView = (y: number) => CURVE_VIEW - toView(y)

/** Format a viewBox coordinate for a DOM attribute (2 decimal places —
 *  raw arithmetic lands 32.400000000000006 in the attribute otherwise). */
const fmt = (v: number) => String(Math.round(v * 100) / 100)

/**
 * Pointer mount on the widget's svg: turns raw pointer events into unit
 * space drags. The mount owns ONLY hit-testing and the drag session — it
 * reads the handle positions from the DOM (the rendered circles' cx/cy, in
 * viewBox units — the DOM is the source of truth, like CompareDivider
 * reading the container rect) and emits `CurvePointDragged` with unit
 * coordinates. All clamping and application happens in the engine + update,
 * so the drag logic stays a pure data transform. Pointer capture keeps the
 * drag alive beyond the widget's bounds; `touch-none` (the class on the
 * svg) keeps a touch drag from scrolling the drawer.
 */
export const CurveWidget = Mount.defineStream(
  'CurveWidget',
  EditorMessage.CurvePointDragged,
)((element) =>
  Stream.callback<typeof EditorMessage.CurvePointDragged.Type>((queue) =>
    Effect.gen(function* () {
      // Narrow to the SVG element (the mount target is always the widget's
      // svg) so the listeners get typed PointerEvents, like the canvas
      // stage's HTMLElement narrowing.
      if (!(element instanceof SVGSVGElement)) {
        return yield* Effect.never
      }
      const svg: SVGSVGElement = element
      // The handle index being dragged; -1 while no drag is active.
      let dragging = -1

      const emit = (index: number, x: number, y: number) =>
        Queue.offerUnsafe(queue, EditorMessage.CurvePointDragged({ index, x, y }))

      /** Pointer position in unit space (0..1, y up). */
      const unitCoords = (e: PointerEvent) => {
        const rect = svg.getBoundingClientRect()
        return {
          x: (e.clientX - rect.left) / rect.width,
          y: (rect.bottom - e.clientY) / rect.height,
        }
      }

      /** The handle index under the pointer, or -1 when none is within
       *  GRAB_THRESHOLD client px of it. */
      const hitTest = (e: PointerEvent): number => {
        const rect = svg.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
          return -1
        }
        let best = -1
        let bestDist = GRAB_THRESHOLD
        svg.querySelectorAll('[data-curve-handle]').forEach((el, index) => {
          const cx = (Number(el.getAttribute('cx')) / CURVE_VIEW) * rect.width
          const cy = (Number(el.getAttribute('cy')) / CURVE_VIEW) * rect.height
          const dx = e.clientX - (rect.left + cx)
          const dy = e.clientY - (rect.top + cy)
          const d = Math.hypot(dx, dy)
          if (d < bestDist) {
            bestDist = d
            best = index
          }
        })
        return best
      }

      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) {
          return
        }
        const index = hitTest(e)
        if (index < 0) {
          return
        }
        dragging = index
        svg.setPointerCapture(e.pointerId)
        // Grab-and-jump: the point follows the pointer from the moment the
        // grab lands (the same feel as dragging an already-selected handle).
        const { x, y } = unitCoords(e)
        emit(index, x, y)
      }
      const onMove = (e: PointerEvent) => {
        if (dragging < 0) {
          return
        }
        const { x, y } = unitCoords(e)
        emit(dragging, x, y)
      }
      const onUp = (e: PointerEvent) => {
        if (dragging < 0) {
          return
        }
        dragging = -1
        svg.releasePointerCapture(e.pointerId)
      }

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          svg.addEventListener('pointerdown', onDown)
          svg.addEventListener('pointermove', onMove)
          svg.addEventListener('pointerup', onUp)
          svg.addEventListener('pointercancel', onUp)
          return { onDown, onMove, onUp }
        }),
        ({ onDown, onMove, onUp }) =>
          Effect.sync(() => {
            svg.removeEventListener('pointerdown', onDown)
            svg.removeEventListener('pointermove', onMove)
            svg.removeEventListener('pointerup', onUp)
            svg.removeEventListener('pointercancel', onUp)
          }),
      )
      return yield* Effect.never
    }),
  ),
)

/** The 25/50/75% grid lines, both axes. */
const gridLines = (h: HtmlBuilder<EditorMessage>) =>
  [25, 50, 75].flatMap((g) => {
    const line = [
      h.Class('stroke-border'),
      h.StrokeWidth('1'),
      h.VectorEffect('non-scaling-stroke'),
    ]
    return [
      h.line([h.X1('0'), h.Y1(String(g)), h.X2('100'), h.Y2(String(g)), ...line], []),
      h.line([h.X1(String(g)), h.Y1('0'), h.X2(String(g)), h.Y2('100'), ...line], []),
    ]
  })

/**
 * The curve editor for a toneCurve layer: label row (with the conditional
 * reset button), the draggable SVG plot, and a one-line hint. Replaces the
 * generic slider list in the drawer (layer-drawer.ts branches on
 * 'toneCurve', like the Color Mixer's swatch row).
 */
export const toneCurveWidget = (h: HtmlBuilder<EditorMessage>, layer: Layer) => {
  if (layer.type !== 'toneCurve') {
    return null
  }
  const points = curvePointsOf(layer)
  const neutral = isCurveNeutral(layer)
  // The curve polyline: the exact piecewise-linear function the shader
  // evaluates, in viewBox space (y flipped).
  const polyline = points
    .map((p) => `${toView(p.x).toFixed(2)},${yToView(p.y).toFixed(2)}`)
    .join(' ')
  return h.div(
    [h.Class('flex flex-col gap-1.5')],
    [
      h.div(
        [h.Class('flex items-baseline justify-between')],
        [
          h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Tone curve']),
          // The reset affordance (docs/adr/0019): visible only while the curve
          // diverges from identity — its presence is the discoverability.
          ...(neutral
            ? []
            : [
                h.button(
                  [
                    h.OnClick(EditorMessage.CurveReset()),
                    h.AriaLabel('Reset curve'),
                    h.Class('grid size-6 place-items-center text-muted hover:text-ink'),
                  ],
                  [icon(h, RotateCcw, 'Reset curve')],
                ),
              ]),
        ],
      ),
      h.svg(
        [
          // touch-none: a touch drag must start the curve drag, not scroll
          // the drawer (the same rule as the canvas stage's pan/zoom).
          h.Class('block h-40 w-full cursor-crosshair touch-none'),
          h.ViewBox(`0 0 ${CURVE_VIEW} ${CURVE_VIEW}`),
          // The plot is wider than tall in the drawer; stretching the unit
          // square keeps the grid and curve aligned with the pointer mapping
          // (both use the same per-axis scale). Handles become slightly
          // elliptical — invisible at their size.
          h.PreserveAspectRatio('none'),
          h.AriaLabel('Tone curve'),
          h.Role('img'),
          h.OnMount(CurveWidget()),
        ],
        [
          ...gridLines(h),
          // The identity diagonal (dashed): a neutral curve sits exactly on
          // it, so any divergence reads at a glance.
          h.line(
            [
              h.X1(String(toView(0))),
              h.Y1(String(yToView(0))),
              h.X2(String(toView(1))),
              h.Y2(String(yToView(1))),
              h.Class('stroke-border-strong'),
              h.StrokeWidth('1'),
              h.StrokeDasharray('3 3'),
              h.VectorEffect('non-scaling-stroke'),
            ],
            [],
          ),
          h.polyline(
            [
              h.Points(polyline),
              h.Class('stroke-accent'),
              h.Fill('none'),
              h.StrokeWidth('2'),
              h.StrokeLinejoin('round'),
              h.VectorEffect('non-scaling-stroke'),
            ],
            [],
          ),
          ...points.map((p, index) =>
            h.circle(
              [
                h.Cx(fmt(toView(p.x))),
                h.Cy(fmt(yToView(p.y))),
                h.R('4.5'),
                // The mount reads these positions for hit-testing; the index
                // keeps the drag target stable across re-renders.
                h.DataAttribute('curve-handle', String(index)),
                h.Class('cursor-grab fill-panel stroke-accent'),
                h.StrokeWidth('2'),
                h.VectorEffect('non-scaling-stroke'),
              ],
              [],
            ),
          ),
        ],
      ),
      h.span(
        [h.Class('text-[10px] leading-3 text-muted')],
        ['Drag the points to shape the curve.'],
      ),
    ],
  )
}
