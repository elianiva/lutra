import type { Html, HtmlBuilder } from 'foldkit/html'
import { cn } from '@/lib/utils'

/**
 * The form controls imgutils shares across both modes, drawn with the Lutra
 * materials (docs/adr/0013-materials): grouped choices sit in a recessed
 * `well`, the selected one lifts out in the accent, and nothing draws an
 * outline.
 */

export const label = <M>(h: HtmlBuilder<M>, text: string, trailing?: string): Html =>
  h.div(
    [h.Class('flex items-baseline justify-between gap-3')],
    [
      h.span([h.Class('label')], [text]),
      trailing === undefined
        ? null
        : h.span([h.Class('tnum font-mono text-[10px] text-ink')], [trailing]),
    ],
  )

/** A titled group of fields inside a panel. */
export const group = <M>(h: HtmlBuilder<M>, title: string, children: ReadonlyArray<Html>): Html =>
  h.section(
    [h.Class('flex flex-col gap-3')],
    [h.h2([h.Class('micro font-semibold')], [title]), ...children],
  )

export const field = <M>(h: HtmlBuilder<M>, children: ReadonlyArray<Html>): Html =>
  h.div([h.Class('flex flex-col gap-1.5')], children)

/** A segmented choice: a well of pill buttons, the selected one in the accent. */
export const segmented = <M, T extends string>(
  h: HtmlBuilder<M>,
  config: Readonly<{
    ariaLabel: string
    options: ReadonlyArray<Readonly<{ label: string; value: T }>>
    selected: T
    onSelect: (value: T) => M
    columns?: number
  }>,
): Html =>
  h.div(
    [
      h.Class('well grid gap-1 p-1'),
      h.Style({
        'grid-template-columns': `repeat(${config.columns ?? config.options.length}, minmax(0, 1fr))`,
      }),
      h.Role('group'),
      h.AriaLabel(config.ariaLabel),
    ],
    config.options.map(({ label: text, value }) => {
      const active = value === config.selected
      return h.button(
        [
          h.Type('button'),
          h.Class(
            cn(
              'h-7 rounded-[10px] px-1 text-[10px] uppercase tracking-[0.1em] transition-colors',
              active
                ? 'bg-s3 text-accent shadow-[inset_0_1px_0_var(--mat-rim),0_1px_3px_var(--mat-shadow-b)]'
                : 'text-muted hover:text-ink',
            ),
          ),
          h.AriaPressed(String(active)),
          h.OnClick(config.onSelect(value)),
        ],
        [text],
      )
    }),
  )

export const numberInput = <M>(
  h: HtmlBuilder<M>,
  config: Readonly<{
    id: string
    value: number
    min: number
    max: number
    step: number
    onChange: (value: number) => M
    className?: string
  }>,
): Html =>
  h.input([
    h.Id(config.id),
    h.Type('number'),
    h.Min(String(config.min)),
    h.Max(String(config.max)),
    h.Step(String(config.step)),
    h.Value(String(config.value)),
    h.Class(
      cn(
        'well h-9 w-full px-3 font-mono text-xs tnum text-ink outline-none focus-visible:shadow-[inset_0_1px_3px_var(--mat-inset),0_0_0_3px_var(--mat-halo)]',
        config.className,
      ),
    ),
    h.OnChange((raw) => config.onChange(Number(raw))),
  ])

/** A colour swatch over the native picker, with the hex value beside it. */
export const colorInput = <M>(
  h: HtmlBuilder<M>,
  config: Readonly<{ id: string; label: string; value: string; onInput: (value: string) => M }>,
): Html =>
  h.label(
    [h.For(config.id), h.Class('well flex h-9 cursor-pointer items-center gap-3 px-2')],
    [
      h.span(
        [
          h.Class(
            'relative size-6 overflow-hidden rounded-full shadow-[0_0_0_1px_var(--mat-fade),0_1px_2px_var(--mat-shadow-b)]',
          ),
          h.Style({ background: config.value }),
        ],
        [
          h.input([
            h.Id(config.id),
            h.Type('color'),
            h.Value(config.value),
            h.AriaLabel(config.label),
            h.Class('absolute inset-0 cursor-pointer opacity-0'),
            h.OnInput(config.onInput),
          ]),
        ],
      ),
      h.span([h.Class('font-mono text-xs uppercase tnum text-ink')], [config.value]),
    ],
  )

/** A pill text button: the app's quiet action. */
export const pillButton = <M>(
  h: HtmlBuilder<M>,
  config: Readonly<{
    label: ReadonlyArray<Html | string>
    onClick: M
    isDisabled?: boolean
    primary?: boolean
    ariaLabel?: string
    className?: string
  }>,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.Class(
        cn(
          'flex h-8 items-center justify-center gap-2 rounded-full px-3 text-[10px] uppercase tracking-[0.1em] whitespace-nowrap transition-colors',
          config.primary === true
            ? 'key bg-accent px-4 text-accent-ink'
            : 'text-muted hover:bg-s2 hover:text-ink',
          config.isDisabled === true ? 'pointer-events-none opacity-35' : '',
          config.className,
        ),
      ),
      ...(config.isDisabled === true ? [h.Disabled(true)] : []),
      ...(config.ariaLabel === undefined ? [] : [h.AriaLabel(config.ariaLabel)]),
      h.OnClick(config.onClick),
    ],
    config.label,
  )
