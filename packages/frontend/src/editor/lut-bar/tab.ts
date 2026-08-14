import type { HtmlBuilder } from 'foldkit/html'
import type { EditorMessage } from '../message'
import { SelectedLutTab } from '../message'

export const tab = (
  h: HtmlBuilder<EditorMessage>,
  tab: string,
  label: string,
  count: number,
  active: boolean,
) =>
  h.button(
    [
      h.OnClick(SelectedLutTab({ tab })),
      h.AriaPressed(String(active)),
      h.AriaLabel(label),
      // Keyed by tab id: the Recents tab inserts at the top of the list
      // when the first LUT is committed — unkeyed, every tab below it
      // would be re-patched in place (a hovered tab silently becomes a
      // different tab).
      h.Key(tab),
      h.Class(
        `flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.14em] ${
          active ? 'bg-panel-alt text-ink' : 'text-muted hover:bg-panel-alt hover:text-ink'
        }`,
      ),
    ],
    [
      h.span([h.Class('truncate')], [label]),
      h.span([h.Class('tnum shrink-0 text-muted')], [String(count)]),
    ],
  )
