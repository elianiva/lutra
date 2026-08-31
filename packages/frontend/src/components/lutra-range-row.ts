import type { Html, HtmlBuilder } from 'foldkit/html'
import { cn } from '@/lib/utils'
import { button } from '@/components/ui/button'
import {
  sliderHeaderClass,
  sliderLabelClass,
  sliderRootClass,
  sliderTrackClass,
  sliderFilledTrackClass,
  sliderThumbClass,
  sliderValueClass,
  sliderRowClass,
} from '@/components/ui/slider'

/**
 * Presentational range row styled like foldcn sliders. Uses a native range
 * input for now so layer-drawer sliders stay message-simple; the track/thumb
 * tokens match @/components/ui/slider for visual parity.
 */
export const lutraRangeRow = <M>(
  h: HtmlBuilder<M>,
  config: Readonly<{
    label: string
    display: string
    min: number
    max: number
    step: number
    value: number
    onInput: (value: number) => M
    ariaLabel?: string
    labelOnClick?: () => M
  }>,
): Html =>
  h.div(
    [h.Class(cn(sliderRowClass, 'gap-1'))],
    [
      h.div(
        [h.Class(sliderHeaderClass)],
        [
          config.labelOnClick
            ? button(
                {
                  onClick: config.labelOnClick(),
                  variant: 'link',
                  size: 'xs',
                  className:
                    'h-auto p-0 text-[10px] uppercase tracking-[0.14em] text-muted hover:text-ink',
                },
                [config.label],
                h,
              )
            : button(
                {
                  variant: 'ghost',
                  size: 'xs',
                  className:
                    'h-auto cursor-default p-0 text-[10px] uppercase tracking-[0.14em] text-muted hover:bg-transparent',
                  attributes: [h.AriaLabel(config.label)],
                },
                [config.label],
                h,
              ),
          h.span([h.Class(cn(sliderValueClass, 'text-xs text-ink tnum'))], [config.display]),
        ],
      ),
      h.div(
        [
          h.Class(cn(sliderRootClass, 'h-7')),
          h.DataAttribute('slot', 'slider'),
          h.AriaLabel(config.ariaLabel ?? config.label),
        ],
        [
          h.div(
            [
              h.Class(cn(sliderTrackClass, 'relative')),
              h.DataAttribute('slot', 'slider-track'),
            ],
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
            h.Type('range'),
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
