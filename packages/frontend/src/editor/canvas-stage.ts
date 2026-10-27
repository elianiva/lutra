import { Effect, Match, Schema as S, Stream, Queue } from 'effect'
import { Mount } from 'foldkit'
import { type Html, type HtmlBuilder, createLazy } from 'foldkit/html'
import { button } from '@/components/ui/button'
import { EditorMessage } from './message'
import { ErrorState, hasImage } from './phase'
import { canvasRef, registerCanvas } from '../gpu/canvas-ref'
import { chainDock } from './chain-dock'
import { viewBar } from './frame-bar'
import { MountElementError } from '../errors'
import type { Model } from './model'

export type CanvasStageModel = Pick<
  Model,
  | 'source'
  | 'scale'
  | 'offsetX'
  | 'offsetY'
  | 'compareMode'
  | 'compareSplitAt'
  | 'phase'
  | 'placeholderUrl'
  | 'chain'
  | 'catalog'
  | 'bins'
>

const ZOOM_SPEED = 0.01

/** Foldkit mounts on any Element; the stage needs HTMLElement APIs (the
 *  typed wheel/pointer event overloads). Narrow via instanceof instead of an
 *  assertion so the linter's assertion ban stays satisfied. Shared with the
 *  LUT bar's wheel mount (lut-bar.ts). */
export const asHtmlElement = (element: Element): HTMLElement => {
  if (element instanceof HTMLElement) {
    return element
  }
  throw new MountElementError({ message: 'PanZoom stage must be an HTMLElement' })
}

/** Pan & zoom mount for the image canvas. Exported for Scene test resolution.
 *  On mount it measures the stage and emits the initial view: the whole image
 *  fitted into the stage (contain, never upscaled past 1×). Wheel zooms about
 *  the cursor; drag pans. The stage resizes re-fit only while the user hasn't
 *  touched the view (zoomed or panned) since the last fit.
 *
 *  Touch (docs/adr/0010-editor-ui.md): the stage is `touch-none`, so pointer drags pan
 *  without the browser hijacking the gesture; two fingers pinch-zoom about
 *  the midpoint, and a double-tap toggles between the fit and 2×.
 */
export const PanZoom = Mount.defineStream('PanZoom', {
  args: { imageHeight: S.Number, imageWidth: S.Number },
  messages: [EditorMessage.ScaledCanvas, EditorMessage.DeselectedAll],
  execute: ({ element, imageWidth, imageHeight }) =>
    Stream.callback<
      typeof EditorMessage.ScaledCanvas.Type | typeof EditorMessage.DeselectedAll.Type
    >((queue) =>
      Effect.gen(function* () {
        const stage = asHtmlElement(element)
        const state = {
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          dragging: false,
          lastX: 0,
          lastY: 0,
          touched: false,
        }
        const pointers = new Map<number, { x: number; y: number }>()
        let pinch: {
          startDist: number
          startScale: number
          startOffsetX: number
          startOffsetY: number
          startMidX: number
          startMidY: number
        } | null = null
        let lastTap = { at: 0, x: 0, y: 0 }
        // Where the press began: a release that has not moved is a click, and a
        // click on bare canvas (not on the chain, the view bar or any control)
        // deselects, like clicking the empty artboard in a design tool.
        let press: { x: number; y: number; onCanvas: boolean } | null = null
        const emit = (scale: number, offsetX: number, offsetY: number) =>
          Queue.offerUnsafe(queue, EditorMessage.ScaledCanvas({ offsetX, offsetY, scale }))

        /** Scale + offsets that center the content in the stage. */
        const fitToStage = () => {
          const rect = stage.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) {
            return null
          }
          const content = contentSize() ?? { height: imageHeight, width: imageWidth }
          if (content.width === 0 || content.height === 0) {
            return null
          }
          const scale = Math.min(rect.width / content.width, rect.height / content.height, 1)
          return {
            offsetX: (rect.width - content.width * scale) / 2,
            offsetY: (rect.height - content.height * scale) / 2,
            scale,
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
          if (!container) {
            return null
          }
          const width = container.clientWidth
          const height = container.clientHeight
          if (width === 0 || height === 0) {
            return null
          }
          return { height, width }
        }

        /** Re-fit the view, unless the user has taken over (zoomed/panned). */
        const refit = () => {
          if (state.touched) {
            return
          }
          const fit = fitToStage()
          if (!fit) {
            return
          }
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
        /** Zoom to `nextScale` about the stage-relative point (cx, cy). */
        const zoomAbout = (nextScale: number, cx: number, cy: number) => {
          const k = nextScale / state.scale
          state.offsetX = cx - (cx - state.offsetX) * k
          state.offsetY = cy - (cy - state.offsetY) * k
          state.scale = nextScale
          emit(state.scale, state.offsetX, state.offsetY)
        }
        /** Double-tap/click: zoomed in → back to the fit; at the fit → 2×. */
        const toggleZoom = () => {
          if (state.scale > 1.02) {
            const fit = fitToStage()
            if (!fit) {
              return
            }
            state.touched = false
            state.scale = fit.scale
            state.offsetX = fit.offsetX
            state.offsetY = fit.offsetY
            emit(fit.scale, fit.offsetX, fit.offsetY)
          } else {
            state.touched = true
            const rect = stage.getBoundingClientRect()
            zoomAbout(2, rect.width / 2, rect.height / 2)
          }
        }
        const onDown = (e: PointerEvent) => {
          if (e.button !== 0) {
            return
          }
          state.touched = true
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
          const onControl =
            e.target instanceof Element &&
            e.target.closest('button, a, input, select, textarea, label, [data-keep-selection]') !==
              null
          if (onControl && pointers.size === 1) {
            // A press on a control is the control's: capturing the pointer for
            // a pan would retarget its click to the stage (the rack's Add row
            // did nothing on touch).
            pointers.delete(e.pointerId)
            press = null
            return
          }
          press = pointers.size === 1 ? { x: e.clientX, y: e.clientY, onCanvas: true } : null
          if (pointers.size === 1) {
            const now = performance.now()
            if (
              e.pointerType === 'touch' &&
              now - lastTap.at < 300 &&
              Math.abs(e.clientX - lastTap.x) < 30 &&
              Math.abs(e.clientY - lastTap.y) < 30
            ) {
              lastTap = { at: 0, x: 0, y: 0 }
              toggleZoom()
              return
            }
            lastTap = { at: now, x: e.clientX, y: e.clientY }
            state.dragging = true
            state.lastX = e.clientX
            state.lastY = e.clientY
            stage.setPointerCapture(e.pointerId)
          } else if (pointers.size === 2) {
            state.dragging = false
            const [a, b] = [...pointers.values()]
            const rect = stage.getBoundingClientRect()
            pinch = {
              startDist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)),
              startMidX: (a!.x + b!.x) / 2 - rect.left,
              startMidY: (a!.y + b!.y) / 2 - rect.top,
              startOffsetX: state.offsetX,
              startOffsetY: state.offsetY,
              startScale: state.scale,
            }
          }
        }
        const onMove = (e: PointerEvent) => {
          if (!pointers.has(e.pointerId)) {
            return
          }
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinch && pointers.size === 2) {
            const [a, b] = [...pointers.values()]
            const rect = stage.getBoundingClientRect()
            const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
            const nextScale = Math.max(0.1, Math.min(8, pinch.startScale * (d / pinch.startDist)))
            const k = nextScale / pinch.startScale
            const midX = (a!.x + b!.x) / 2 - rect.left
            const midY = (a!.y + b!.y) / 2 - rect.top
            state.scale = nextScale
            state.offsetX = midX - (pinch.startMidX - pinch.startOffsetX) * k
            state.offsetY = midY - (pinch.startMidY - pinch.startOffsetY) * k
            emit(state.scale, state.offsetX, state.offsetY)
            return
          }
          if (!state.dragging) {
            return
          }
          state.offsetX += e.clientX - state.lastX
          state.offsetY += e.clientY - state.lastY
          state.lastX = e.clientX
          state.lastY = e.clientY
          emit(state.scale, state.offsetX, state.offsetY)
        }
        const onUp = (e: PointerEvent) => {
          if (
            e.type === 'pointerup' &&
            press?.onCanvas === true &&
            pointers.size === 1 &&
            Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4
          ) {
            Queue.offerUnsafe(queue, EditorMessage.DeselectedAll())
          }
          press = null
          pointers.delete(e.pointerId)
          if (pointers.size === 0) {
            state.dragging = false
            pinch = null
            stage.releasePointerCapture(e.pointerId)
          } else if (pointers.size === 1) {
            pinch = null
            state.dragging = true
            const [rest] = [...pointers.values()]
            state.lastX = rest!.x
            state.lastY = rest!.y
          }
        }

        const resizeObserver = new ResizeObserver(refit)
        resizeObserver.observe(stage)
        const container = stage.firstElementChild
        const contentObserver = container ? new ResizeObserver(refit) : null
        if (contentObserver && container) {
          contentObserver.observe(container)
        }

        yield* Effect.acquireRelease(
          Effect.sync(() => {
            stage.addEventListener('wheel', onWheel, { passive: false })
            stage.addEventListener('pointerdown', onDown)
            stage.addEventListener('pointermove', onMove)
            stage.addEventListener('pointerup', onUp)
            stage.addEventListener('pointercancel', onUp)
            stage.addEventListener('dblclick', toggleZoom)
            return { contentObserver, onDown, onMove, onUp, onWheel, resizeObserver }
          }),
          ({ onWheel, onDown, onMove, onUp, resizeObserver, contentObserver }) =>
            Effect.sync(() => {
              stage.removeEventListener('wheel', onWheel)
              stage.removeEventListener('pointerdown', onDown)
              stage.removeEventListener('pointermove', onMove)
              stage.removeEventListener('pointerup', onUp)
              stage.removeEventListener('pointercancel', onUp)
              stage.removeEventListener('dblclick', toggleZoom)
              resizeObserver.disconnect()
              contentObserver?.disconnect()
            }),
        )
        return yield* Effect.never
      }),
    ),
})

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
export const RegisterCanvas = Mount.define('RegisterCanvas', {
  messages: [EditorMessage.CanvasRegistered],
  execute: ({ element }) =>
    Effect.gen(function* () {
      if (element instanceof HTMLCanvasElement) {
        yield* registerCanvas(canvasRef, element)
      }
      return EditorMessage.CanvasRegistered()
    }),
})

/**
 * Pointer mount for the Split-mode divider: dragging moves the split
 * position, double-clicking resets it to 50%. The divider element lives
 * inside the panned/zoomed image container, so the position is measured in
 * image space — a fraction of the container's width — and pans/zooms with
 * the photo. Pointer events are stopped at the element so the stage's
 * pan/zoom drag never starts while grabbing the divider.
 */
export const CompareDivider = Mount.defineStream('CompareDivider', {
  messages: [EditorMessage.ChangedSplitPosition],
  execute: ({ element }) =>
    Stream.callback<typeof EditorMessage.ChangedSplitPosition.Type>((queue) =>
      Effect.gen(function* () {
        const divider = asHtmlElement(element)
        const container = divider.parentElement
        const emit = (position: number) =>
          Queue.offerUnsafe(queue, EditorMessage.ChangedSplitPosition({ position }))

        let dragging = false
        // >60 Hz) while PresentFrame is a GPU blit submit; keep only the
        let pendingPosition: number | null = null
        let rafId: number | null = null
        const flushPending = () => {
          rafId = null
          if (pendingPosition !== null) {
            const pos = pendingPosition
            pendingPosition = null
            emit(pos)
          }
        }

        const onDown = (e: PointerEvent) => {
          if (e.button !== 0) {
            return
          }
          e.stopPropagation()
          dragging = true
          divider.setPointerCapture(e.pointerId)
        }
        const onMove = (e: PointerEvent) => {
          if (!dragging || !container) {
            return
          }
          const rect = container.getBoundingClientRect()
          if (rect.width === 0) {
            return
          }
          const next = (e.clientX - rect.left) / rect.width
          pendingPosition = next
          if (rafId === null) {
            rafId = requestAnimationFrame(flushPending)
          }
        }
        const onUp = (e: PointerEvent) => {
          dragging = false
          if (rafId !== null) {
            cancelAnimationFrame(rafId)
            rafId = null
          }
          if (pendingPosition !== null) {
            const pos = pendingPosition
            pendingPosition = null
            emit(pos)
          }
          divider.releasePointerCapture(e.pointerId)
        }
        const onDblClick = () => emit(0.5)

        yield* Effect.acquireRelease(
          Effect.sync(() => {
            divider.addEventListener('pointerdown', onDown)
            divider.addEventListener('pointermove', onMove)
            divider.addEventListener('pointerup', onUp)
            divider.addEventListener('dblclick', onDblClick)
            return { onDblClick, onDown, onMove, onUp }
          }),
          ({ onDown, onMove, onUp, onDblClick }) =>
            Effect.sync(() => {
              if (rafId !== null) {
                cancelAnimationFrame(rafId)
              }
              divider.removeEventListener('pointerdown', onDown)
              divider.removeEventListener('pointermove', onMove)
              divider.removeEventListener('pointerup', onUp)
              divider.removeEventListener('dblclick', onDblClick)
            }),
        )
        return yield* Effect.never
      }),
    ),
})

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
const lazySplitDivider = createLazy()

const splitDividerView = (splitAt: number, scale: number, h: HtmlBuilder<EditorMessage>): Html =>
  h.div(
    [
      h.Class('absolute inset-y-0 z-10 -translate-x-1/2 cursor-col-resize'),
      h.Style({
        left: `${splitAt * 100}%`,
        width: `${12 / scale}px`,
      }),
      h.OnMount(CompareDivider()),
      h.Attribute('data-compare-divider', 'true'),
    ],
    [
      h.div(
        [
          h.Class('absolute inset-y-0 left-1/2 -translate-x-1/2 bg-ink/70'),
          h.Style({ width: `${1 / scale}px` }),
        ],
        [],
      ),
      h.div(
        [
          h.Class(
            'absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_2px_8px_var(--mat-shadow-a)]',
          ),
          h.Style({ height: `${12 / scale}px`, width: `${12 / scale}px` }),
        ],
        [],
      ),
    ],
  )

const splitDivider = (h: HtmlBuilder<EditorMessage>, model: CanvasStageModel): Html =>
  lazySplitDivider(splitDividerView, [model.compareSplitAt, model.scale, h])!

/** The placeholder frame before an image is loaded: a 4:5 print. */
const PLACEHOLDER_RATIO = 0.8

/** The saved thumbnail, softened, while the attached Edit's source decodes. */
const placeholderStage = (h: HtmlBuilder<EditorMessage>, url: string) =>
  h.div(
    [h.Class('flex h-full w-full items-center justify-center'), h.AriaLabel('Loading photo')],
    [
      h.img([
        h.Src(url),
        h.Alt(''),
        h.Class('breathe max-h-full max-w-full object-contain blur-sm'),
      ]),
    ],
  )

const emptyStage = (h: HtmlBuilder<EditorMessage>) =>
  h.div(
    [
      h.Class(
        'stagger flex h-full w-full flex-col items-center justify-center gap-3 text-xs text-muted',
      ),
      h.AllowDrop(),
      h.OnDropFiles((files) => {
        const file = files[0]
        return file ? EditorMessage.SelectedImageFile({ file }) : EditorMessage.FilePickRequested()
      }),
    ],
    [
      h.div(
        [h.Class('grid size-14 place-items-center rounded-full bg-s2 text-lg text-muted')],
        ['↑'],
      ),
      h.div(
        [h.Class('flex items-center gap-1')],
        [
          'Drop an image here, or ',
          button(
            {
              onClick: EditorMessage.FilePickRequested(),
              variant: 'link',
              className: 'h-auto p-0 text-accent',
            },
            'browse',
            h,
          ),
        ],
      ),
      h.p([h.Class('text-[10px] text-dim')], ['Supports JPEG, PNG, WebP']),
    ],
  )

const errorStage = (h: HtmlBuilder<EditorMessage>, error: string) =>
  h.div(
    [
      h.Class(
        'enter-rise flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted',
      ),
    ],
    [
      h.p([], [`Failed to load image: ${error}`]),
      button(
        {
          onClick: EditorMessage.FilePickRequested(),
          variant: 'link',
          className: 'h-auto p-0 text-accent',
        },
        'Try another',
        h,
      ),
    ],
  )

/** The content aspect: side-by-side shows two frames side by side. */
const contentRatio = (model: CanvasStageModel): number => {
  const width = model.compareMode === 'side-by-side' ? model.source.width * 2 : model.source.width
  const height = model.source.height
  return width > 0 && height > 0 ? width / height : PLACEHOLDER_RATIO
}

/**
 * The print and the modules attached to it (docs/adr/0013-materials).
 *
 * The picture is the centre: one card holding the print area, its caption and
 * the controls that change what it shows. The edit chain docks to that card's
 * right edge as separate modules — one per layer, numbered top to bottom, so
 * the order of the chain and the picture it produces are read in one glance.
 *
 * With an empty chain there are no modules: the frame is just the print.
 */
const mount = (
  h: HtmlBuilder<EditorMessage>,
  model: CanvasStageModel,
  content: Html,
  ratio: number,
): Html => {
  return h.div(
    [h.Class('flex flex-col items-stretch gap-3 lg:flex-row lg:items-start lg:gap-3')],
    [
      h.figure(
        [
          h.Class('surface relative m-0 flex w-fit max-w-full flex-col p-3 max-lg:p-2'),
          h.AriaLabel('Print preview'),
        ],
        [
          h.div(
            [
              h.Class('print-stage relative overflow-hidden rounded-[8px] bg-[var(--mat-stage)]'),
              h.Style({ '--ar': ratio.toFixed(4) }),
            ],
            [content],
          ),
          viewBar(h, {
            compareMode: model.compareMode,
            phase: model.phase,
            bins: model.bins,
          }),
        ],
      ),
      chainDock(h, { chain: model.chain, phase: model.phase, catalog: model.catalog }),
    ],
  )
}

const loadedStage = (h: HtmlBuilder<EditorMessage>, model: CanvasStageModel, ratio: number) => {
  const src = model.source
  const contentWidth = model.compareMode === 'side-by-side' ? src.width * 2 : src.width
  return h.div(
    [
      // The whole area pans and zooms, not only the print: the print is a
      // sheet on the desk, and the desk is the surface you grab.
      h.Class('absolute inset-0 touch-none'),
      h.OnMount(PanZoom({ imageHeight: src.height, imageWidth: contentWidth })),
    ],
    [
      h.div(
        [
          h.Class('relative w-fit origin-top-left'),
          h.Attribute(
            'style',
            `transform: translate(${model.offsetX}px, ${model.offsetY}px) scale(${model.scale})`,
          ),
        ],
        [
          mount(
            h,
            model,
            h.div(
              [h.Class('absolute inset-0')],
              [
                h.canvas(
                  [
                    h.Id('lutra-canvas'),
                    h.OnMount(RegisterCanvas()),
                    h.Attribute('width', String(contentWidth)),
                    h.Attribute('height', String(src.height)),
                    h.Class('block h-full w-full'),
                  ],
                  [],
                ),
                model.compareMode === 'split' ? splitDivider(h, model) : null,
              ],
            ),
            ratio,
          ),
        ],
      ),
    ],
  )
}

export const canvasStage = (h: HtmlBuilder<EditorMessage>, model: CanvasStageModel) => {
  const ratio = contentRatio(model)
  const loaded = hasImage(model.phase)
  // On a phone the top bar floats over the stage, so the stage box keeps
  // clear of it; the inspector sheet rises over the stage's lower half.
  return h.div(
    [
      h.Class(
        'absolute inset-x-0 top-0 bottom-0 flex items-center justify-center overflow-hidden max-lg:top-[64px]',
      ),
    ],
    [
      ...(loaded
        ? [loadedStage(h, model, ratio)]
        : [
            h.div(
              [h.Class('absolute inset-0 flex items-center justify-center')],
              [
                mount(
                  h,
                  model,
                  Match.value(model.phase).pipe(
                    Match.withReturnType<Html>(),
                    Match.when(S.is(ErrorState), () =>
                      errorStage(h, model.source.error?.message ?? 'Unknown error'),
                    ),
                    Match.orElse(() =>
                      model.placeholderUrl === null
                        ? emptyStage(h)
                        : placeholderStage(h, model.placeholderUrl),
                    ),
                  ),
                  PLACEHOLDER_RATIO,
                ),
              ],
            ),
          ]),
    ],
  )
}
