import type { HtmlBuilder } from 'foldkit/html'
import { button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { tabsTriggerClass } from '@/components/ui/tabs'
import { EditorMessage } from '../message'

export const tab = (
  h: HtmlBuilder<EditorMessage>,
  tab: string,
  label: string,
  count: number,
  active: boolean,
) =>
  button(
    {
      onClick: EditorMessage.SelectedLutTab({ tab }),
      size: 'xs',
      variant: active ? 'secondary' : 'ghost',
      className: cn(
        tabsTriggerClass,
        'flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.14em] rounded-none',
        active ? 'bg-panel-alt text-ink' : 'text-muted hover:bg-panel-alt hover:text-ink',
      ),
      attributes: [
        h.AriaPressed(String(active)),
        h.AriaLabel(label),
        h.Key(tab),
      ],
    },
    [
      h.span([h.Class('truncate')], [label]),
      h.span([h.Class('tnum shrink-0 text-muted')], [String(count)]),
    ],
    h,
  )
