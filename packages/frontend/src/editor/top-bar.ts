import type { HtmlBuilder } from 'foldkit/html'
import { Download } from 'lucide'
import { icon } from '../components/icon'
import { ExportRequested, ClearedImage, SaveRequested, SaveAsRequested } from './message'
import type { EditorMessage } from './message'
import type { Model } from './model'

/**
 * Top bar: LUTRA wordmark left; right side: the save flow (Save, Save as,
 * and the last save's status), export, and clear.
 *
 * Save persists the committed chain through the Edit store — in place when
 * the editor has an attached Edit, creating a new Edit for a fresh in-editor
 * pick. Save as always forks a new Edit, so it stays disabled until the
 * editor has an attached Edit to fork from. Both are disabled while a save
 * is in flight (at most one at a time) and while no image is loaded.
 */
export const topBar = (h: HtmlBuilder<EditorMessage>, model: Model, hasImage: boolean) => {
  const saving = model.saveStatus._tag === 'saving'
  const attachedId = model.attachedEdit?.id ?? null
  return h.header(
    [
      h.Class(
        'flex items-center justify-between border-b border-border bg-panel px-4 py-2',
      ),
    ],
    [
      h.h1([h.Class('text-sm font-semibold tracking-[0.3em] text-accent')], ['LUTRA']),
      h.div([h.Class('flex items-center gap-1')], [
        saveStatusText(h, model),
        h.button(
          [
            h.OnClick(SaveRequested()),
            h.Disabled(!hasImage || saving),
            h.AriaLabel('Save edit'),
            h.Class(
              'rounded bg-accent px-3 py-1 text-xs text-ink hover:opacity-80 disabled:opacity-30',
            ),
          ],
          [saving ? 'Saving…' : 'Save'],
        ),
        h.button(
          [
            h.OnClick(SaveAsRequested()),
            h.Disabled(!hasImage || saving || attachedId === null),
            h.AriaLabel('Save as a new edit'),
            h.Class(
              'px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-30',
            ),
          ],
          ['Save as'],
        ),
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
}

/**
 * The save flow's status line: the last successful save's time (the gallery
 * tile carries the same `savedAt`) or the last failure's reason. Nothing
 * while idle or saving — the Save button's "Saving…" label covers that.
 */
const saveStatusText = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const status = model.saveStatus
  if (status._tag === 'saved') {
    return h.span([h.Class('pr-1 text-[10px] text-muted')], [
      `Saved ${new Date(status.at).toLocaleTimeString()}`,
    ])
  }
  if (status._tag === 'failed') {
    return h.span([h.Class('pr-1 text-[10px] text-accent'), h.Title(status.error.message)], [
      'Save failed',
    ])
  }
  return null
}
