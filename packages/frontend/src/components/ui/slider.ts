/** Stateful submodel — import the whole module as a namespace and wire its
 *  Model/Message/init/update into your app:
 *  `import * as Slider from '@/components/ui/slider'`
 */
import { Effect, Equal, Match as M, Option, Schema as S, Stream, pipe } from 'effect'
import { Slider as FoldkitSlider } from '@foldkit/ui'
import { childAttributes, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'

import { cn } from '@/lib/utils'

/**
 * foldcn gap vs upstream: single value / single thumb only (upstream is
 * multi-thumb; foldcn renders one thumb). Vertical orientation and
 * edge-aligned thumb/range geometry are owned by this module's view until
 * foldkit/ui gains parity (see foldcn issue tracker).
 */

export const init = FoldkitSlider.init
export const update = FoldkitSlider.update
export const Model = FoldkitSlider.Model
export type Model = typeof Model.Type
export const Message = FoldkitSlider.Message
export type Message = typeof Message.Type
export const OutMessage = FoldkitSlider.OutMessage
export type OutMessage = typeof OutMessage.Type

export const snapAndClamp = FoldkitSlider.snapAndClamp
export const fractionOfValue = FoldkitSlider.fractionOfValue
export const reflectRange = FoldkitSlider.reflectRange

export type InitConfig = FoldkitSlider.InitConfig
export type SliderAttributes = FoldkitSlider.SliderAttributes

/** Upstream SliderPrimitive.Control string. */
export const sliderRootClass =
  'data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col'

/** Upstream SliderPrimitive.Track string. */
export const sliderTrackClass =
  'bg-border-strong rounded-none data-horizontal:h-0.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-0.5 relative grow overflow-hidden select-none'

export const sliderFilledTrackClass = 'bg-accent select-none data-horizontal:h-full data-vertical:w-full'

export const sliderThumbClass =
  'border-accent ring-ring/50 relative size-4 rounded-none border bg-accent transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50'

export const sliderLabelClass = 'text-sm font-medium'

export const sliderValueClass = 'text-sm tabular-nums text-muted-foreground'

export const sliderRowClass = 'flex flex-col gap-2 w-full'

export const sliderHeaderClass = 'flex items-center justify-between'

const LEFT_MOUSE_BUTTON = 0
const THUMB_SIZE = '0.75rem'
const THUMB_HALF = '0.375rem'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const percentString = (fraction: number): string => `${String(Math.round(fraction * 10000) / 100)}%`

const labelId = (id: string): string => `${id}-label`

type KeyboardDirection =
  | 'StepDecrement'
  | 'StepIncrement'
  | 'PageDecrement'
  | 'PageIncrement'
  | 'Min'
  | 'Max'

const keyToDirection = (key: string): Option.Option<KeyboardDirection> =>
  M.value(key).pipe(
    M.withReturnType<KeyboardDirection>(),
    M.whenOr('ArrowRight', 'ArrowUp', () => 'StepIncrement' as const),
    M.whenOr('ArrowLeft', 'ArrowDown', () => 'StepDecrement' as const),
    M.when('PageUp', () => 'PageIncrement' as const),
    M.when('PageDown', () => 'PageDecrement' as const),
    M.when('Home', () => 'Min' as const),
    M.when('End', () => 'Max' as const),
    M.option,
  )

const isVerticalTrack = (element: Element): boolean =>
  element.hasAttribute('data-vertical') || element.closest('[data-vertical]') !== null

const trackElement = (id: string, root: Document | ShadowRoot): Option.Option<Element> =>
  Option.fromNullishOr(root.querySelector(`[data-slider-track-id="${CSS.escape(id)}"]`))

export const valueFromPointer = (
  clientX: number,
  clientY: number,
  track: Element,
  min: number,
  max: number,
): number => {
  const rect = track.getBoundingClientRect()
  if (isVerticalTrack(track)) {
    if (rect.height === 0) return min
    const fraction = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
    return min + fraction * (max - min)
  }
  if (rect.width === 0) return min
  const fraction = clamp((clientX - rect.left) / rect.width, 0, 1)
  return min + fraction * (max - min)
}

const DragActivity = S.Literals(['Idle', 'Active'])

const dragActivityFromModel = (model: Model): 'Idle' | 'Active' =>
  M.value(model.dragState).pipe(
    M.withReturnType<'Idle' | 'Active'>(),
    M.tag('Dragging', (): 'Idle' | 'Active' => 'Active'),
    M.orElse((): 'Idle' | 'Active' => 'Idle'),
  )

/** Drag subscriptions that map pointer position along the track axis, including
 *  vertical sliders marked with `data-vertical`. Pending foldkit upstream (#27).
 */
export const subscriptionsForRoot = (getTrackRoot: () => Document | ShadowRoot) =>
  Subscription.make<Model, Message>()((entry) => ({
    dragPointer: entry(
      {
        dragActivity: DragActivity,
        id: S.String,
        min: S.Number,
        max: S.Number,
      },
      {
        modelToDependencies: (model) => ({
          dragActivity: dragActivityFromModel(model),
          id: model.id,
          min: model.min,
          max: model.max,
        }),
        dependenciesToStream: ({ dragActivity, id, min, max }): Stream.Stream<Message> => {
          const pointerEvents = Stream.merge(
            Stream.fromEventListener(document, 'pointermove').pipe(
              Stream.mapEffect((event) =>
                Effect.sync(() => {
                  if (!(event instanceof PointerEvent)) return Option.none()
                  return Option.flatMap(trackElement(id, getTrackRoot()), (element) =>
                    Option.some(
                      Message.MovedDragPointer({
                        value: valueFromPointer(event.clientX, event.clientY, element, min, max),
                      }),
                    ),
                  )
                }),
              ),
              Stream.filter(Option.isSome),
              Stream.map((option) => option.value),
            ),
            Stream.fromEventListener(document, 'pointerup').pipe(
              Stream.map(() => Message.ReleasedDragPointer()),
            ),
          )

          const documentDragStyles = Stream.callback(() =>
            Effect.acquireRelease(
              Effect.sync(() => {
                document.documentElement.style.setProperty('user-select', 'none')
                document.documentElement.style.setProperty('-webkit-user-select', 'none')
                const cursorStyle = document.createElement('style')
                cursorStyle.textContent = '* { cursor: grabbing !important; }'
                document.head.appendChild(cursorStyle)
                return cursorStyle
              }),
              (cursorStyle) =>
                Effect.sync(() => {
                  document.documentElement.style.removeProperty('user-select')
                  document.documentElement.style.removeProperty('-webkit-user-select')
                  cursorStyle.remove()
                }),
            ).pipe(Effect.flatMap(() => Effect.never)),
          )

          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Stream.when widens the element type
          return Stream.when(
            Stream.merge(pointerEvents, documentDragStyles),
            Effect.sync(() => dragActivity === 'Active'),
          ) as Stream.Stream<Message>
        },
      },
    ),
    dragEscape: entry(
      { dragActivity: DragActivity },
      {
        modelToDependencies: (model) => ({
          dragActivity: dragActivityFromModel(model),
        }),
        dependenciesToStream: ({ dragActivity }): Stream.Stream<Message> =>
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Stream.when widens the element type
          Stream.when(
            Stream.fromEventListener(document, 'keydown').pipe(
              Stream.filter(
                (event): event is KeyboardEvent =>
                  event instanceof KeyboardEvent && event.key === 'Escape',
              ),
              Stream.map(() => Message.CancelledDrag()),
            ),
            Effect.sync(() => dragActivity === 'Active'),
          ) as Stream.Stream<Message>,
      },
    ),
  }))

export const subscriptions = subscriptionsForRoot(() => document)

type Orientation = 'horizontal' | 'vertical'

const filledTrackStyle = (
  orientation: Orientation,
  fraction: number,
): Readonly<Record<string, string>> => {
  if (orientation === 'vertical') {
    // oxlint-disable-next-line anti-slop/no-known-value-widening -- SAFETY: style bag must be Record<string,string> for h.Style; literal evidence is intentionally widened to the style contract
    return {
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: '0',
      height: percentString(fraction),
      width: '100%',
      'pointer-events': 'none',
    }
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- SAFETY: style bag must be Record<string,string> for h.Style; literal evidence is intentionally widened to the style contract
  return {
    position: 'absolute',
    left: '0',
    top: '0',
    bottom: '0',
    width: `calc((100% - ${THUMB_SIZE}) * ${fraction} + ${THUMB_HALF})`,
    'pointer-events': 'none',
  }
}

const thumbStyle = (
  orientation: Orientation,
  fraction: number,
): Readonly<Record<string, string>> => {
  if (orientation === 'vertical') {
    // oxlint-disable-next-line anti-slop/no-known-value-widening -- SAFETY: style bag must be Record<string,string> for h.Style; literal evidence is intentionally widened to the style contract
    return {
      position: 'absolute',
      bottom: percentString(fraction),
      left: '50%',
      transform: 'translateX(-50%) translateY(-50%)',
      'touch-action': 'none',
    }
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- SAFETY: style bag must be Record<string,string> for h.Style; literal evidence is intentionally widened to the style contract
  return {
    position: 'absolute',
    left: `calc((100% - ${THUMB_SIZE}) * ${fraction})`,
    'touch-action': 'none',
  }
}

/** Per-render view inputs passed to `view` via `h.submodel`'s `viewInputs` field. */
export type ViewInputs = Readonly<{
  value: number
  toView: (attributes: SliderAttributes) => Html
  orientation?: Orientation
  ariaLabel?: string
  ariaLabelledBy?: string
  formatValue?: (value: number) => string
  isDisabled?: boolean
  isReadOnly?: boolean
  name?: string
  getTrackRoot?: () => Document | ShadowRoot
}>

/** Renders an accessible slider with upstream edge-aligned geometry and
 *  vertical orientation support, delegating shadcn layout to `toView`. */
export const view = defineView<Model, Message, ViewInputs>((model, viewInputs, h) => {
  const {
    value,
    formatValue,
    isDisabled = false,
    isReadOnly = false,
    name,
    orientation = 'horizontal',
    getTrackRoot = () => document,
  } = viewInputs
  const { id, min, max } = model
  const isDragging = model.dragState._tag === 'Dragging'
  const fraction = fractionOfValue(value, min, max)
  const isInteractive = !isDisabled && !isReadOnly

  const handleKeyDown = (key: string) =>
    Option.map(keyToDirection(key), (direction) =>
      Message.PressedKeyboardNavigation({ direction, value }),
    )

  const pointerAtPointer = (clientX: number, clientY: number) =>
    Option.flatMap(trackElement(id, getTrackRoot()), (element) =>
      Option.some(
        Message.PressedPointer({
          value: valueFromPointer(clientX, clientY, element, min, max),
          originValue: value,
        }),
      ),
    )

  const trackPointerHandler = (
    _pointerType: string,
    button: number,
    _screenX: number,
    _screenY: number,
    _timeStamp: number,
    clientX: number,
    clientY: number,
  ) =>
    pipe(
      button,
      Option.liftPredicate(Equal.equals(LEFT_MOUSE_BUTTON)),
      Option.flatMap(() => pointerAtPointer(clientX, clientY)),
    )

  const thumbPointerHandler = (_pointerType: string, button: number) =>
    pipe(
      button,
      Option.liftPredicate(Equal.equals(LEFT_MOUSE_BUTTON)),
      Option.map(() => Message.PressedThumb({ originValue: value })),
    )

  const stateAttributes = [
    ...(isDragging ? [h.DataAttribute('dragging', '')] : []),
    ...(isDisabled ? [h.DataAttribute('disabled', '')] : []),
    ...(isReadOnly ? [h.DataAttribute('readonly', '')] : []),
  ]

  const rootAttributes = [
    h.DataAttribute('slider-id', id),
    h.DataAttribute('orientation', orientation),
    h.DataAttribute(orientation, ''),
    ...stateAttributes,
  ]

  const trackInteractionAttributes = isInteractive ? [h.OnPointerDown(trackPointerHandler)] : []

  const trackAttributes = [
    h.DataAttribute('slider-track-id', id),
    h.DataAttribute('orientation', orientation),
    h.DataAttribute(orientation, ''),
    h.Style({ position: 'relative', 'touch-action': 'none' }),
    ...stateAttributes,
    ...trackInteractionAttributes,
  ]

  const filledTrackAttributes = [
    h.Style(filledTrackStyle(orientation, fraction)),
    ...stateAttributes,
  ]

  const thumbLabelAttributes =
    viewInputs.ariaLabel !== undefined
      ? [h.AriaLabel(viewInputs.ariaLabel)]
      : viewInputs.ariaLabelledBy !== undefined
        ? [h.AriaLabelledBy(viewInputs.ariaLabelledBy)]
        : [h.AriaLabelledBy(labelId(id))]

  const maybeAriaValuetext = formatValue !== undefined ? [h.AriaValuetext(formatValue(value))] : []

  const thumbInteractionAttributes = isInteractive
    ? [h.OnPointerDown(thumbPointerHandler), h.OnKeyDownPreventDefault(handleKeyDown)]
    : []

  const thumbAttributes = [
    h.Id(`${id}-thumb`),
    h.Role('slider'),
    h.Tabindex(0),
    h.AriaOrientation(orientation),
    h.AriaValuemin(min),
    h.AriaValuemax(max),
    h.AriaValuenow(value),
    ...maybeAriaValuetext,
    ...thumbLabelAttributes,
    ...(isDisabled ? [h.AriaDisabled(true)] : []),
    ...(isReadOnly ? [h.AriaReadonly(true)] : []),
    h.Style(thumbStyle(orientation, fraction)),
    ...stateAttributes,
    ...thumbInteractionAttributes,
  ]

  const labelAttributes = [h.Id(labelId(id))]

  const hiddenInputAttributes =
    name !== undefined ? [h.Type('hidden'), h.Name(name), h.Value(value.toString())] : []

  return viewInputs.toView({
    root: childAttributes(rootAttributes),
    track: childAttributes(trackAttributes),
    filledTrack: childAttributes(filledTrackAttributes),
    thumb: childAttributes(thumbAttributes),
    label: childAttributes(labelAttributes),
    hiddenInput: childAttributes(hiddenInputAttributes),
  })
})

export type StyledViewInputs = Readonly<{
  value: number
  min?: number
  max?: number
  orientation?: Orientation
  label?: string
  formatValue?: (value: number) => string
  ariaLabel?: string
  ariaLabelledBy?: string
  isDisabled?: boolean
  isReadOnly?: boolean
  name?: string
  getTrackRoot?: () => Document | ShadowRoot
  rootClass?: string
  trackClass?: string
  filledTrackClass?: string
  thumbClass?: string
  rowClass?: string
  labelClass?: string
  valueClass?: string
  headerClass?: string
}>

/** Build styled `Slider.ViewInputs`. Pass your view's `h`. */
export const styledViewInputs = <M>(
  viewInputs: StyledViewInputs,
  h: HtmlBuilder<M>,
): ViewInputs => {
  const orientation = viewInputs.orientation ?? 'horizontal'
  const base: ViewInputs = {
    value: viewInputs.value,
    orientation,
    toView: (attributes): Html => {
      const maybeHeader: Html =
        viewInputs.label === undefined
          ? h.empty
          : h.div(
              [h.Class(cn(sliderHeaderClass, viewInputs.headerClass))],
              [
                h.label(
                  [...attributes.label, h.Class(cn(sliderLabelClass, viewInputs.labelClass))],
                  [viewInputs.label],
                ),
                h.span(
                  [h.Class(cn(sliderValueClass, viewInputs.valueClass))],
                  [
                    viewInputs.formatValue === undefined
                      ? String(viewInputs.value)
                      : viewInputs.formatValue(viewInputs.value),
                  ],
                ),
              ],
            )

      const maybeHiddenInput: Html =
        attributes.hiddenInput.length > 0 ? h.input([...attributes.hiddenInput]) : h.empty

      return h.div(
        [h.Class(cn(sliderRowClass, viewInputs.rowClass))],
        [
          maybeHeader,
          h.div(
            [
              ...attributes.root,
              h.DataAttribute('slot', 'slider'),
              h.Class(cn(sliderRootClass, viewInputs.rootClass)),
            ],
            [
              h.div(
                [
                  ...attributes.track,
                  h.DataAttribute('slot', 'slider-track'),
                  h.Class(cn(sliderTrackClass, viewInputs.trackClass)),
                ],
                [
                  h.div([
                    ...attributes.filledTrack,
                    h.DataAttribute('slot', 'slider-range'),
                    h.Class(cn(sliderFilledTrackClass, viewInputs.filledTrackClass)),
                  ]),
                ],
              ),
              h.div([
                ...attributes.thumb,
                h.DataAttribute('slot', 'slider-thumb'),
                h.Class(cn(sliderThumbClass, viewInputs.thumbClass)),
              ]),
            ],
          ),
          maybeHiddenInput,
        ],
      )
    },
  }
  const viewInputsWithOptional = Object.assign(
    base,
    viewInputs.ariaLabel !== undefined ? { ariaLabel: viewInputs.ariaLabel } : null,
    viewInputs.ariaLabelledBy !== undefined ? { ariaLabelledBy: viewInputs.ariaLabelledBy } : null,
    viewInputs.formatValue !== undefined ? { formatValue: viewInputs.formatValue } : null,
    viewInputs.isDisabled !== undefined ? { isDisabled: viewInputs.isDisabled } : null,
    viewInputs.isReadOnly !== undefined ? { isReadOnly: viewInputs.isReadOnly } : null,
    viewInputs.name !== undefined ? { name: viewInputs.name } : null,
    viewInputs.getTrackRoot !== undefined ? { getTrackRoot: viewInputs.getTrackRoot } : null,
  )
  return viewInputsWithOptional
}

