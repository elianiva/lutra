import { Switch as FoldkitSwitch } from '@foldkit/ui'
import type { HtmlBuilder } from 'foldkit/html'

import { cn } from '@/lib/utils'

/**
 * foldkit deltas (inlined at style resolution): foldkit emits aria-disabled/
 * data-disabled instead of native disabled, and only data-checked (never
 * data-unchecked) on the ROOT button — this view hand-emits data-unchecked
 * there when off. Upstream Base UI also puts data-checked/data-unchecked on
 * the THUMB itself (the travel/track variants like
 * group-data-[size=default]/switch:data-checked:* key on the thumb's own
 * attribute), so the thumb span mirrors the state attribute too.
 *
 */

export const switchSizeKeys = ['default', 'sm'] as const
export type SwitchSize = (typeof switchSizeKeys)[number]

export const switchClass =
  'data-checked:border-accent data-checked:bg-accent data-unchecked:border-border-strong data-unchecked:bg-panel-alt shrink-0 rounded-none border focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 relative inline-flex h-5 w-9 items-center transition-colors outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50'

export const switchThumbClass =
  'bg-muted data-checked:bg-ink data-unchecked:bg-muted size-3 rounded-none data-checked:translate-x-4 data-unchecked:translate-x-0.5 pointer-events-none block transition-transform'

export const switchLabelClass =
  'text-sm font-medium leading-none group-data-[disabled]/field:cursor-not-allowed group-data-[disabled]/field:opacity-70'

export const switchDescriptionClass = 'text-sm text-muted-foreground'

export const switchWrapperClass = 'group/field flex items-center gap-3'

export const switchTextWrapperClass = 'flex flex-col gap-1'

export type SwitchConfig<M> = Readonly<{
  id: string
  isChecked: boolean
  onToggle: (isChecked: boolean) => M
  label: string
  description?: string
  isDisabled?: boolean
  isReadOnly?: boolean
  name?: string
  value?: string
  size?: SwitchSize
  className?: string
  thumbClass?: string
  labelClass?: string
  descriptionClass?: string
  wrapperClass?: string
}>

/** Styled switch with label and optional description, built on the @foldkit/ui Switch helper. */
export const switchControl = <M>(config: SwitchConfig<M>, h: HtmlBuilder<M>) => {
  let viewInputs: Parameters<typeof FoldkitSwitch.view<M>>[0] = {
    id: config.id,
    isChecked: config.isChecked,
    onToggle: config.onToggle,
    toView: (attributes) =>
      h.div(
        [
          h.Class(cn(switchWrapperClass, config.wrapperClass)),
          ...(config.isDisabled ? [h.DataAttribute('disabled', '')] : []),
        ],
        [
          h.button(
            [
              ...attributes.button,
              h.DataAttribute('slot', 'switch'),
              h.DataAttribute('size', config.size ?? 'default'),
              ...(config.isChecked
                ? [h.DataAttribute('checked', '')]
                : [h.DataAttribute('unchecked', '')]),
              h.Class(
                cn(
                  switchClass,
                  config.isChecked
                    ? 'border-accent bg-accent'
                    : 'border-border-strong bg-panel-alt',
                  config.className,
                ),
              ),
            ],
            [
              h.span([
                h.DataAttribute('slot', 'switch-thumb'),
                h.DataAttribute(config.isChecked ? 'checked' : 'unchecked', ''),
                h.Class(cn(switchThumbClass, config.thumbClass)),
              ]),
            ],
          ),
          ...(attributes.hiddenInput.length > 0 ? [h.input([...attributes.hiddenInput])] : []),
          h.div(
            [h.Class(switchTextWrapperClass)],
            [
              h.label(
                [...attributes.label, h.Class(cn(switchLabelClass, config.labelClass))],
                [config.label],
              ),
              config.description === undefined
                ? h.empty
                : h.p(
                    [
                      ...attributes.description,
                      h.Class(cn(switchDescriptionClass, config.descriptionClass)),
                    ],
                    [config.description],
                  ),
            ],
          ),
        ],
      ),
  }
  if (config.isDisabled !== undefined) {
    viewInputs = { ...viewInputs, isDisabled: config.isDisabled }
  }
  if (config.isReadOnly !== undefined) {
    viewInputs = { ...viewInputs, isReadOnly: config.isReadOnly }
  }
  if (config.name !== undefined) {
    viewInputs = { ...viewInputs, name: config.name }
  }
  if (config.value !== undefined) {
    viewInputs = { ...viewInputs, value: config.value }
  }
  return FoldkitSwitch.view<M>(viewInputs, h)
}

export const switch_ = switchControl
