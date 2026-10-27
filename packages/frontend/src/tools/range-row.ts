import type { Html, HtmlBuilder } from 'foldkit/html'
import { cn } from '@/lib/utils'

// The foldcn Slider's track and thumb classes (components/ui/slider in the
// editor), so a range row here matches the editor's sliders.
const sliderRootClass =
  'data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col'
const sliderTrackClass =
  'bg-[var(--mat-track)] relative h-1.5 w-full grow overflow-hidden rounded-full select-none data-vertical:h-full data-vertical:w-1.5'
const sliderFilledTrackClass =
  'bg-accent rounded-full select-none data-horizontal:h-full data-vertical:w-full'
const sliderThumbClass =
  'knob relative size-4 transition-shadow after:absolute after:-inset-2 focus-visible:outline-hidden block shrink-0 select-none pointer-events-none'
const sliderValueClass = 'text-sm tabular-nums text-muted-foreground'
const sliderRowClass = 'flex flex-col gap-2 w-full'
const sliderHeaderClass = 'flex items-center justify-between'

/**
 * A range row styled like the editor's foldcn sliders: a native range input
 * keeps the messages simple, under the slider's track, fill and knob.
 */
export const rangeRow = <M>(
  h: HtmlBuilder<M>,
  config: Readonly<{
    label: string
    display: string
    min: number
    max: number
    step: number
    value: number
    onInput: (value: number) => M
    id: string
    ariaLabel?: string
    isDisabled?: boolean
  }>,
): Html =>
  h.div(
    [h.Class(cn(sliderRowClass, 'gap-1'))],
    [
      h.div(
        [h.Class(sliderHeaderClass)],
        [
          h.label([h.For(config.id), h.Class('label')], [config.label]),
          h.span([h.Class(cn(sliderValueClass, 'text-xs text-ink tnum'))], [config.display]),
        ],
      ),
      h.div(
        [
          h.Class(cn(sliderRootClass, 'h-7')),
          h.DataAttribute('slot', 'slider'),
          ...(config.isDisabled === true ? [h.DataAttribute('disabled', '')] : []),
          h.AriaLabel(config.ariaLabel ?? config.label),
        ],
        [
          h.div(
            [h.Class(cn(sliderTrackClass, 'relative')), h.DataAttribute('slot', 'slider-track')],
            [
              h.div([
                h.Class(cn(sliderFilledTrackClass, 'absolute left-0 top-0')),
                h.DataAttribute('slot', 'slider-range'),
                h.Style({
                  width: `${String(((config.value - config.min) / (config.max - config.min)) * 100)}%`,
                  height: '100%',
                }),
              ]),
            ],
          ),
          h.input([
            h.Id(config.id),
            h.Type('range'),
            ...(config.isDisabled === true ? [h.Disabled(true)] : []),
            h.Class('lutra-range absolute inset-0 z-10 opacity-0'),
            h.Min(String(config.min)),
            h.Max(String(config.max)),
            h.Step(String(config.step)),
            h.Value(String(config.value)),
            h.OnInput((raw) => config.onInput(Number(raw))),
          ]),
          h.div([
            h.Class(cn(sliderThumbClass, 'pointer-events-none absolute top-1/2 -translate-y-1/2')),
            h.DataAttribute('slot', 'slider-thumb'),
            h.Style({
              left: `calc((100% - 1rem) * ${String((config.value - config.min) / (config.max - config.min))})`,
            }),
          ]),
        ],
      ),
    ],
  )
