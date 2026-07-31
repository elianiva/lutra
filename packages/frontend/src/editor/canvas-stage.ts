import { Effect, Schema as S, Stream, Queue } from 'effect'
import { Mount } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import type { AppMessage } from '../app/message'
import { FilePickRequested, ScaledCanvas, SelectedImageFile } from '../app/message'
import type { Model } from '../app/model'

const ZOOM_SPEED = 0.01

/** Foldkit mounts on any Element; the stage needs HTMLElement APIs (the
 *  typed wheel/pointer event overloads). Narrow via instanceof instead of an
 *  assertion so the linter's assertion ban stays satisfied. */
const asHtmlElement = (element: Element): HTMLElement => {
  if (element instanceof HTMLElement) return element
  throw new Error('PanZoom stage must be an HTMLElement')
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
)(({ imageWidth, imageHeight }) => (element) =>
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

      /** Scale + offsets that center the image in the stage at ≤ 100%. */
      const fitToStage = () => {
        const rect = stage.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0 || imageWidth === 0 || imageHeight === 0) {
          return null
        }
        const scale = Math.min(rect.width / imageWidth, rect.height / imageHeight, 1)
        return {
          scale,
          offsetX: (rect.width - imageWidth * scale) / 2,
          offsetY: (rect.height - imageHeight * scale) / 2,
        }
      }

      // Initial view: fit the whole image into the stage.
      const fit = fitToStage()
      if (fit) {
        state.scale = fit.scale
        state.offsetX = fit.offsetX
        state.offsetY = fit.offsetY
        emit(fit.scale, fit.offsetX, fit.offsetY)
      }

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
      const resizeObserver = new ResizeObserver(() => {
        if (state.touched) return
        const fit = fitToStage()
        if (!fit) return
        state.scale = fit.scale
        state.offsetX = fit.offsetX
        state.offsetY = fit.offsetY
        emit(fit.scale, fit.offsetX, fit.offsetY)
      })
      resizeObserver.observe(stage)

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          stage.addEventListener('wheel', onWheel, { passive: false })
          stage.addEventListener('pointerdown', onDown)
          stage.addEventListener('pointermove', onMove)
          stage.addEventListener('pointerup', onUp)
          return { onWheel, onDown, onMove, onUp, resizeObserver }
        }),
        ({ onWheel, onDown, onMove, onUp, resizeObserver }) =>
          Effect.sync(() => {
            stage.removeEventListener('wheel', onWheel)
            stage.removeEventListener('pointerdown', onDown)
            stage.removeEventListener('pointermove', onMove)
            stage.removeEventListener('pointerup', onUp)
            resizeObserver.disconnect()
          }),
      )
      return yield* Effect.never
    }),
  ),
)

// ---- sub-views ----

const emptyStage = (h: HtmlBuilder<AppMessage>) =>
  h.div([
    h.Class('flex flex-col items-center justify-center gap-3 text-sm text-muted select-none'),
    h.AllowDrop(),
    h.OnDropFiles((files) => {
      const file = files[0]
      return file ? SelectedImageFile({ file }) : FilePickRequested()
    }),
  ], [
    h.div([h.Class('flex h-16 w-16 items-center justify-center border border-border text-muted')], [
      h.span([h.Class('text-2xl')], ['↑']),
    ]),
    h.div([], [
      'Drop an image here, or ',
      h.button(
        [
          h.Class('cursor-pointer text-foreground underline underline-offset-2'),
          h.OnClick(FilePickRequested()),
        ],
        ['browse'],
      ),
    ]),
    h.p([h.Class('text-xs text-muted')], ['Supports JPEG, PNG, WebP']),
  ])

const errorStage = (h: HtmlBuilder<AppMessage>, error: string) =>
  h.div([h.Class('flex flex-col items-center justify-center gap-2 text-sm text-muted')], [
    h.p([], [`Failed to load image: ${error}`]),
    h.button(
      [
        h.Class('cursor-pointer text-foreground underline underline-offset-2'),
        h.OnClick(FilePickRequested()),
      ],
      ['Try another'],
    ),
  ])

const loadedStage = (h: HtmlBuilder<AppMessage>, model: Model) => {
  const src = model.source
  return h.div(
    [
      // inset-0: the stage div fills the center column, so the transform div
      // below is anchored to the stage origin and pan/zoom offsets are plain
      // stage coordinates (no flex centering to compensate for).
      h.Class('absolute inset-0'),
      h.OnMount(PanZoom({ imageWidth: src.width, imageHeight: src.height })),
    ],
    [
      h.div(
        [
          h.Class('origin-top-left'),
          h.Attribute(
            'style',
            `transform: translate(${model.offsetX}px, ${model.offsetY}px) scale(${model.scale})`,
          ),
        ],
        [
          h.canvas(
            [
              h.Id('lutra-canvas'),
              // width/height attributes size both the CSS layout and (via
              // configure) the WebGPU swapchain; the GPU backend blits every
              // rendered frame straight onto this canvas.
              h.Attribute('width', String(src.width)),
              h.Attribute('height', String(src.height)),
              h.Class('block'),
            ],
            [],
          ),
        ],
      ),
    ],
  )
}

/** Center stage: shows an upload dropzone until an image is loaded, then the
 *  rendered canvas with pan/zoom. */
export const canvasStage = (h: HtmlBuilder<AppMessage>, model: Model) =>
  h.main(
    [h.Class('relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-bg')],
    [
      model.source.status === 'loaded' && model.source.bitmap
        ? loadedStage(h, model)
        : model.source.status === 'error'
          ? errorStage(h, model.source.error ?? 'Unknown error')
          : emptyStage(h),
    ],
  )
