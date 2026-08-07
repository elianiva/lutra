import { Effect, Match, Schema as S, Stream, Queue } from 'effect'
import { Mount } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Eye, EyeOff, SquareSplitHorizontal, Columns2, type IconNode } from 'lucide'
import type { EditorMessage } from './message'
import {
  FilePickRequested,
  ScaledCanvas,
  SelectedImageFile,
  CanvasRegistered,
  ChangedCompareMode,
  ChangedSplitPosition,
  type CompareMode,
} from './message'
import { Empty, ErrorState, hasImage, Loading } from './phase'
import { canvasRef, registerCanvas } from '../gpu/canvas-ref'
import { MountElementError } from '../errors'
import type { Model } from './model'
import { icon } from '../components/icon'

const ZOOM_SPEED = 0.01

/** Foldkit mounts on any Element; the stage needs HTMLElement APIs (the
 *  typed wheel/pointer event overloads). Narrow via instanceof instead of an
 *  assertion so the linter's assertion ban stays satisfied. Shared with the
 *  LUT bar's wheel mount (lut-bar.ts). */
export const asHtmlElement = (element: Element): HTMLElement => {
  if (element instanceof HTMLElement) return element
  throw new MountElementError({ message: 'PanZoom stage must be an HTMLElement' })
}

/** Pan & zoom mount for the image canvas. Exported for Scene test resolution.
 *  On mount it measures the stage and emits the initial view: the whole image
 *  fitted into the stage (contain, never upscaled past 1×). Wheel zooms about
 *  the cursor; drag pans. The stage resizes re-fit only while the user hasn't
 *  touched the view (zoomed or panned) since the last fit. */
export const PanZoom = Mount.defineStream(
  'PanZoom',
  { imageWidth: S.Number, imageHeight: S.Number },
  ScaledCanvas,
)(
  ({ imageWidth, imageHeight }) =>
    (element) =>
      Stream.callback<typeof ScaledCanvas.Type>((queue) =>
        Effect.gen(function* () {
          const stage = asHtmlElement(element)
          const state = {
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            dragging: false,
            lastX: 0,
            lastY: 0,
            // Set on the first wheel/drag; while false the view is still the
            // auto-fit, so a stage resize can safely re-fit.
            touched: false,
          }
          const emit = (scale: number, offsetX: number, offsetY: number) =>
            Queue.offerUnsafe(queue, ScaledCanvas({ scale, offsetX, offsetY }))

          /** Scale + offsets that center the content in the stage. */
          const fitToStage = () => {
            const rect = stage.getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) return null
            const content = contentSize() ?? { width: imageWidth, height: imageHeight }
            if (content.width === 0 || content.height === 0) return null
            const scale = Math.min(rect.width / content.width, rect.height / content.height, 1)
            return {
              scale,
              offsetX: (rect.width - content.width * scale) / 2,
              offsetY: (rect.height - content.height * scale) / 2,
            }
          }

          /**
           * The panned/zoomed content's layout size. The stage's first child
           * is the w-fit transform container around the canvas, so its layout
           * size IS the content size — and it changes with the canvas: Side by
           * side doubles the canvas width. (Transforms never affect layout, so
           * measuring the container is immune to the pan/zoom itself.) Falls
           * back to the mount-time props when the container is missing or not
           * laid out yet.
           */
          const contentSize = () => {
            const container = stage.firstElementChild
            if (!container) return null
            const width = container.clientWidth
            const height = container.clientHeight
            if (width === 0 || height === 0) return null
            return { width, height }
          }

          /** Re-fit the view, unless the user has taken over (zoomed/panned). */
          const refit = () => {
            if (state.touched) return
            const fit = fitToStage()
            if (!fit) return
            state.scale = fit.scale
            state.offsetX = fit.offsetX
            state.offsetY = fit.offsetY
            emit(fit.scale, fit.offsetX, fit.offsetY)
          }

          refit()

          const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            state.touched = true
            const rect = stage.getBoundingClientRect()
            const cx = e.clientX - rect.left
            const cy = e.clientY - rect.top
            // Normalize the delta to pixels: trackpads report pixels, mice report
            // lines (and some devices pages). Then scale the zoom factor by the
            // delta so trackpads (many small deltas) and mice (few large deltas)
            // zoom at a comparable, controlled rate. A fixed per-event factor made
            // trackpads zoom far too aggressively.
            const delta =
              e.deltaMode === WheelEvent.DOM_DELTA_LINE
                ? e.deltaY * 16
                : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
                  ? e.deltaY * 100
                  : e.deltaY
            const factor = Math.exp(-delta * ZOOM_SPEED)
            const nextScale = Math.max(0.1, Math.min(8, state.scale * factor))
            const k = nextScale / state.scale
            state.offsetX = cx - (cx - state.offsetX) * k
            state.offsetY = cy - (cy - state.offsetY) * k
            state.scale = nextScale
            emit(state.scale, state.offsetX, state.offsetY)
          }
          const onDown = (e: PointerEvent) => {
            if (e.button !== 0) return
            state.touched = true
            state.dragging = true
            state.lastX = e.clientX
            state.lastY = e.clientY
            stage.setPointerCapture(e.pointerId)
          }
          const onMove = (e: PointerEvent) => {
            if (!state.dragging) return
            state.offsetX += e.clientX - state.lastX
            state.offsetY += e.clientY - state.lastY
            state.lastX = e.clientX
            state.lastY = e.clientY
            emit(state.scale, state.offsetX, state.offsetY)
          }
          const onUp = (e: PointerEvent) => {
            state.dragging = false
            stage.releasePointerCapture(e.pointerId)
          }

          // Re-fit when the stage resizes, as long as the user hasn't panned or
          // zoomed since the last fit.
          const resizeObserver = new ResizeObserver(refit)
          resizeObserver.observe(stage)
          // The canvas itself resizes when the compare mode changes (Side by
          // side doubles the canvas width) — the stage does not. Observe the
          // content container so the wider strip is re-fitted into view. The
          // observer's initial callback re-emits the mount-time fit, which is
          // a no-op (same values).
          const container = stage.firstElementChild
          const contentObserver = container ? new ResizeObserver(refit) : null
          if (contentObserver && container) contentObserver.observe(container)

          yield* Effect.acquireRelease(
            Effect.sync(() => {
              stage.addEventListener('wheel', onWheel, { passive: false })
              stage.addEventListener('pointerdown', onDown)
              stage.addEventListener('pointermove', onMove)
              stage.addEventListener('pointerup', onUp)
              return { onWheel, onDown, onMove, onUp, resizeObserver, contentObserver }
            }),
            ({ onWheel, onDown, onMove, onUp, resizeObserver, contentObserver }) =>
              Effect.sync(() => {
                stage.removeEventListener('wheel', onWheel)
                stage.removeEventListener('pointerdown', onDown)
                stage.removeEventListener('pointermove', onMove)
                stage.removeEventListener('pointerup', onUp)
                resizeObserver.disconnect()
                contentObserver?.disconnect()
              }),
          )
          return yield* Effect.never
        }),
      ),
)

// ---- canvas registration ----

/**
 * One-shot mount on the render canvas: registers the element in the shared
 * `canvasRef` so render commands resolve the canvas from the app context
 * instead of a global DOM query. The registration lives for the element's
 * lifetime (a scope finalizer — the mount's scope stays open until the
 * element unmounts): when the canvas unmounts, the ref is cleared unless a
 * newer canvas already replaced it.
 *
 * The mount writes the shared ref directly instead of resolving the
 * `CanvasRef` service: mounts run in the runtime's render context, which
 * does not include the `resources` layer — the service is only visible to
 * Commands and Subscriptions.
 */
export const RegisterCanvas = Mount.define(
  'RegisterCanvas',
  CanvasRegistered,
)((element) =>
  Effect.gen(function* () {
    if (element instanceof HTMLCanvasElement) {
      yield* registerCanvas(canvasRef, element)
    }
    return CanvasRegistered()
  }),
)

// ---- compare (before/after viewing) ----

/**
 * Pointer mount for the Split-mode divider: dragging moves the split
 * position, double-clicking resets it to 50%. The divider element lives
 * inside the panned/zoomed image container, so the position is measured in
 * image space — a fraction of the container's width — and pans/zooms with
 * the photo. Pointer events are stopped at the element so the stage's
 * pan/zoom drag never starts while grabbing the divider.
 */
export const CompareDivider = Mount.defineStream(
  'CompareDivider',
  ChangedSplitPosition,
)((element) =>
  Stream.callback<typeof ChangedSplitPosition.Type>((queue) =>
    Effect.gen(function* () {
      const divider = asHtmlElement(element)
      const container = divider.parentElement
      const emit = (position: number) => Queue.offerUnsafe(queue, ChangedSplitPosition({ position }))

      let dragging = false

      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return
        // The stage's pan/zoom mount listens on the stage element; stopping
        // the event here keeps a divider grab from becoming a pan.
        e.stopPropagation()
        dragging = true
        divider.setPointerCapture(e.pointerId)
      }
      const onMove = (e: PointerEvent) => {
        if (!dragging || !container) return
        const rect = container.getBoundingClientRect()
        if (rect.width === 0) return
        emit((e.clientX - rect.left) / rect.width)
      }
      const onUp = (e: PointerEvent) => {
        dragging = false
        divider.releasePointerCapture(e.pointerId)
      }
      const onDblClick = () => emit(0.5)

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          divider.addEventListener('pointerdown', onDown)
          divider.addEventListener('pointermove', onMove)
          divider.addEventListener('pointerup', onUp)
          divider.addEventListener('dblclick', onDblClick)
          return { onDown, onMove, onUp, onDblClick }
        }),
        ({ onDown, onMove, onUp, onDblClick }) =>
          Effect.sync(() => {
            divider.removeEventListener('pointerdown', onDown)
            divider.removeEventListener('pointermove', onMove)
            divider.removeEventListener('pointerup', onUp)
            divider.removeEventListener('dblclick', onDblClick)
          }),
      )
      return yield* Effect.never
    }),
  ),
)

/**
 * The Split-mode divider: a draggable strip (with a visible 1px line and a
 * center handle) positioned at the split position in image space, so it
 * pans and zooms with the photo (CONTEXT.md "Split position"). Its sizes
 * are counter-scaled by the current zoom (strip/handle 12/scale px, line
 * 1/scale px), keeping the whole divider a constant ~12 screen px no
 * matter how far the photo is zoomed out — at the fit zoom of a large
 * photo an unscaled 12px strip shrinks to a couple of pixels and becomes
 * effectively undraggable. Rendered only in Split mode; the canvas blit
 * draws the before/after boundary underneath it.
 */
const splitDivider = (h: HtmlBuilder<EditorMessage>, model: Model) =>
  h.div(
    [
      h.Class('absolute inset-y-0 z-10 -translate-x-1/2 cursor-col-resize'),
      h.Style({
        left: `${model.compareSplitAt * 100}%`,
        width: `${12 / model.scale}px`,
      }),
      h.OnMount(CompareDivider()),
      h.Attribute('data-compare-divider', 'true'),
    ],
    [
      h.div(
        [
          h.Class('absolute inset-y-0 left-1/2 -translate-x-1/2 bg-ink/60'),
          h.Style({ width: `${1 / model.scale}px` }),
        ],
        [],
      ),
      h.div(
        [
          h.Class(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-ink bg-panel',
          ),
          h.Style({ width: `${12 / model.scale}px`, height: `${12 / model.scale}px` }),
        ],
        [],
      ),
    ],
  )

const COMPARE_MODES: ReadonlyArray<{
  readonly mode: CompareMode
  readonly label: string
  readonly icon: IconNode
}> = [
  { mode: 'off', label: 'Off', icon: EyeOff },
  { mode: 'toggle', label: 'Toggle', icon: Eye },
  { mode: 'split', label: 'Split', icon: SquareSplitHorizontal },
  { mode: 'side-by-side', label: 'Side by side', icon: Columns2 },
]

/**
 * The Compare control (CONTEXT.md "Compare"): a segmented Off / Toggle /
 * Split / Side by side picker floating at the bottom-center of the canvas
 * stage. Presentation-only — selecting a mode dispatches PresentFrame,
 * never a chain render (docs/adr/0011). Dimmed until an image is loaded. In
 * Toggle mode the segment doubles as the flip button (update flips the
 * side).
 */
const compareControl = (h: HtmlBuilder<EditorMessage>, model: Model, hasImage: boolean) =>
  h.div(
    [
      h.Class(
        'absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-stretch divide-x divide-border border border-border bg-panel',
      ),
      h.AriaLabel('Compare modes'),
    ],
    COMPARE_MODES.map(({ mode, label, icon: Icon }) => {
      const active = model.compareMode === mode
      return h.button(
        [
          h.Class(
            active
              ? 'flex items-center gap-1.5 bg-accent px-3 py-1.5 text-ink'
              : 'flex items-center gap-1.5 px-3 py-1.5 text-muted hover:bg-panel-alt hover:text-ink',
          ),
          h.Disabled(!hasImage),
          h.OnClick(ChangedCompareMode({ mode })),
          h.AriaLabel(label),
          h.Title(label),
        ],
        [icon(h, Icon, label, 14), h.span([h.Class('text-xs')], [label])],
      )
    }),
  )

// ---- sub-views ----

const emptyStage = (h: HtmlBuilder<EditorMessage>) =>
  h.div(
    [
      h.Class('flex flex-col items-center justify-center gap-3 text-sm text-muted select-none'),
      h.AllowDrop(),
      h.OnDropFiles((files) => {
        const file = files[0]
        return file ? SelectedImageFile({ file }) : FilePickRequested()
      }),
    ],
    [
      h.div(
        [h.Class('flex h-16 w-16 items-center justify-center border border-border text-muted')],
        [h.span([h.Class('text-2xl')], ['↑'])],
      ),
      h.div(
        [],
        [
          'Drop an image here, or ',
          h.button(
            [
              h.Class('cursor-pointer text-ink underline underline-offset-2'),
              h.OnClick(FilePickRequested()),
            ],
            ['browse'],
          ),
        ],
      ),
      h.p([h.Class('text-xs text-muted')], ['Supports JPEG, PNG, WebP']),
    ],
  )

const errorStage = (h: HtmlBuilder<EditorMessage>, error: string) =>
  h.div(
    [h.Class('flex flex-col items-center justify-center gap-2 text-sm text-muted')],
    [
      h.p([], [`Failed to load image: ${error}`]),
      h.button(
        [
          h.Class('cursor-pointer text-ink underline underline-offset-2'),
          h.OnClick(FilePickRequested()),
        ],
        ['Try another'],
      ),
    ],
  )

// ---- histogram overlay ----

const HISTOGRAM_WIDTH = 220
const HISTOGRAM_HEIGHT = 110

/**
 * The **Histogram overlay**: a filled-area luminance histogram of the frame
 * currently displayed, fixed to the stage's bottom-right corner. Screen
 * space — a sibling of the panned/zoomed image, so pan/zoom never moves it.
 * Purely decorative: `pointer-events-none`, so wheel and drag pass straight
 * through. Linear max-bin normalization; an all-black frame draws a flat
 * baseline. Rendered as SVG in the foldkit view — a pure function of the
 * model's bins, like every other piece of UI.
 */
const histogramOverlay = (h: HtmlBuilder<EditorMessage>, bins: Uint32Array | null) => {
  if (!bins) return null

  let max = 0
  for (let i = 0; i < 256; i++) {
    if (bins[i]! > max) max = bins[i]!
  }

  // Area polygon: the bin curve left→right, then the bottom edge back to
  // the origin. The stroke reuses the same curve (without the corners).
  const curve: string[] = []
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * HISTOGRAM_WIDTH
    const y = max === 0 ? 0 : HISTOGRAM_HEIGHT - (bins[i]! / max) * HISTOGRAM_HEIGHT
    curve.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  const area = [...curve, `${HISTOGRAM_WIDTH},${HISTOGRAM_HEIGHT}`, `0,${HISTOGRAM_HEIGHT}`]

  return h.div(
    [
      h.Class(
        'pointer-events-none absolute bottom-3 right-3 rounded border border-border bg-panel/80 text-ink',
      ),
      h.Attribute('style', `width: ${HISTOGRAM_WIDTH}px; height: ${HISTOGRAM_HEIGHT}px;`),
    ],
    [
      h.svg(
        [
          h.Class('block h-full w-full'),
          h.Attribute('viewBox', `0 0 ${HISTOGRAM_WIDTH} ${HISTOGRAM_HEIGHT}`),
        ],
        [
          h.polygon(
            [
              h.Attribute('points', area.join(' ')),
              h.Attribute('fill', 'currentColor'),
              h.Attribute('fill-opacity', '0.25'),
            ],
            [],
          ),
          h.polyline(
            [
              h.Attribute('points', curve.join(' ')),
              h.Attribute('fill', 'none'),
              h.Attribute('stroke', 'currentColor'),
              h.Attribute('stroke-width', '1'),
            ],
            [],
          ),
        ],
      ),
    ],
  )
}

const loadedStage = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const src = model.source
  // Side by side shows both halves at native resolution: the canvas is 2×
  // the image width (source left, graded right), so neither side is
  // stretched. The GPU backend rebuilds its session on the size change and
  // the blit maps each half 1:1; PanZoom re-fits to the wider content.
  const contentWidth = model.compareMode === 'side-by-side' ? src.width * 2 : src.width
  return h.div(
    [
      // inset-0: the stage div fills the center column, so the transform div
      // below is anchored to the stage origin and pan/zoom offsets are plain
      // stage coordinates (no flex centering to compensate for).
      h.Class('absolute inset-0'),
      h.OnMount(PanZoom({ imageWidth: contentWidth, imageHeight: src.height })),
    ],
    [
      h.div(
        [
          // relative: the containing block for image-space children (the
          // compare divider's `left: N%` resolves against the image width,
          // not the stage — CONTEXT.md "Split position"). w-fit: the
          // container wraps the image-sized canvas instead of stretching
          // to the stage, so percentages mean image pixels.
          h.Class('relative w-fit origin-top-left'),
          h.Attribute(
            'style',
            `transform: translate(${model.offsetX}px, ${model.offsetY}px) scale(${model.scale})`,
          ),
        ],
        [
          h.canvas(
            [
              h.Id('lutra-canvas'),
              // Register this element in the CanvasRef service on mount, so
              // render commands resolve it from the app context (no global
              // getElementById lookup).
              h.OnMount(RegisterCanvas()),
              // width/height attributes size both the CSS layout and (via
              // configure) the WebGPU swapchain; the GPU backend blits every
              // rendered frame straight onto this canvas. Side by side
              // doubles the width, so the swapchain is 2× the image width
              // and each half shows at native resolution.
              h.Attribute('width', String(contentWidth)),
              h.Attribute('height', String(src.height)),
              h.Class('block'),
            ],
            [],
          ),
          // The divider sits in image space, so it moves with the image
          // under pan/zoom; the blit draws the before/after boundary right
          // under it.
          model.compareMode === 'split' ? splitDivider(h, model) : null,
        ],
      ),
      histogramOverlay(h, model.bins),
    ],
  )
}

/** Center stage: shows an upload dropzone until an image is loaded, then the
 *  rendered canvas with pan/zoom, and always the Compare control (dimmed
 *  without an image). Which stage shows is the phase machine's call
 *  (./phase.ts): Empty/Loading → upload zone, Error → error stage,
 *  Idle/Drafting/Selected → the loaded canvas. */
export const canvasStage = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const imageLoaded = hasImage(model.phase)
  return h.main(
    [h.Class('relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-bg')],
    [
      Match.value(model.phase).pipe(
        Match.withReturnType<Html>(),
        Match.when(S.is(ErrorState), () =>
          errorStage(h, model.source.error?.message ?? 'Unknown error'),
        ),
        Match.when(S.is(Empty), () => emptyStage(h)),
        Match.when(S.is(Loading), () => emptyStage(h)),
        Match.orElse(() => loadedStage(h, model)),
      ),
      compareControl(h, model, imageLoaded),
    ],
  )
}
