import type { HtmlBuilder } from 'foldkit/html'
import { Download } from 'lucide'
import { icon } from '../components/icon'
import { ExportRequested, ClearedImage } from './message'
import type { EditorMessage } from './message'

/** Minimal top bar: LUTRA wordmark left, export + clear right. */
export const topBar = (h: HtmlBuilder<EditorMessage>, hasImage: boolean) =>
  h.header(
    [
      h.Class(
        'flex items-center justify-between border-b border-border bg-panel px-4 py-2',
      ),
    ],
    [
      h.h1([h.Class('text-sm font-semibold tracking-[0.3em] text-accent')], ['LUTRA']),
      h.div([h.Class('flex items-center gap-1')], [
        h.button(
          [
            h.OnClick(ExportRequested()),
            h.Disabled(!hasImage),
            h.AriaLabel('Export image'),
            h.Class(
              'grid size-8 place-items-center text-muted hover:text-ink disabled:opacity-30',
            ),
          ],
          [icon(h, Download, 'Export')],
        ),
        h.button(
          [
            h.OnClick(ClearedImage()),
            h.Disabled(!hasImage),
            h.AriaLabel('Start over'),
            h.Class('px-2 text-xs text-muted hover:text-ink disabled:opacity-30'),
          ],
          ['New'],
        ),
      ]),
    ],
  )