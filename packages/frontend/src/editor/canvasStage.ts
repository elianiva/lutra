import { Effect, Schema as S, Stream, Queue } from 'effect'
import { Mount } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import type { AppMessage } from '../app/message'
import { FilePickRequested, ScaledCanvas, SelectedImageFile } from '../app/message'
import type { Model } from '../app/model'

// ---- mount: pan & zoom on the image canvas ----

/** Pan & zoom mount for the image canvas. Exported for Scene test resolution. */
export const PanZoom = Mount.defineStream('PanZoom', ScaledCanvas)((element) =>
  Stream.callback<typeof ScaledCanvas.Type>((queue) =>
    Effect.gen(function* () {
      const stage = element as HTMLElement
      const state = { scale: 1, offsetX: 0, offsetY: 0, dragging: false, lastX: 0, lastY: 0 }
      const emit = (scale: number, offsetX: number, offsetY: number) =>
        Queue.offerUnsafe(queue, ScaledCanvas({ scale, offsetX, offsetY }))
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const rect = stage.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        const nextScale = Math.max(0.1, Math.min(8, state.scale * factor))
        const k = nextScale / state.scale
        state.offsetX = cx - (cx - state.offsetX) * k
        state.offsetY = cy - (cy - state.offsetY) * k
        state.scale = nextScale
        emit(state.scale, state.offsetX, state.offsetY)
      }
      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return
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
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          stage.addEventListener('wheel', onWheel, { passive: false })
          stage.addEventListener('pointerdown', onDown)
          stage.addEventListener('pointermove', onMove)
          stage.addEventListener('pointerup', onUp)
          return { onWheel, onDown, onMove, onUp }
        }),
        ({ onWheel, onDown, onMove, onUp }) =>
          Effect.sync(() => {
            stage.removeEventListener('wheel', onWheel)
            stage.removeEventListener('pointerdown', onDown)
            stage.removeEventListener('pointermove', onMove)
            stage.removeEventListener('pointerup', onUp)
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
    [h.Class('absolute'), h.OnMount(PanZoom())],
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
