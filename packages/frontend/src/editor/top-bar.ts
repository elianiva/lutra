import { DateTime, Match } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { CopyPlus, Download, Plus } from 'lucide'
import { button } from '@/components/ui/button'
import { icon } from '../components/icon'
import { EditorMessage } from './message'
import type { Model } from './model'

/**
 * Top bar: LUTRA wordmark left; right side: the save flow (Save, Save as,
 * and the last save's status), export, and clear.
 *
 * On phones (docs/adr/0010-editor-ui.md) the wordmark and Save stay, while Save as and
 * New collapse to icon-only buttons (`sm` restores the text) — the whole
 * action row must fit a ~360px viewport next to the wordmark.
 *
 * Save persists the committed chain through the Edit store — in place when
 * the editor has an attached Edit, creating a new Edit for a fresh in-editor
 * pick. Save as always forks a new Edit, so it stays disabled until the
 * editor has an attached Edit to fork from. Both are disabled while a save
 * is in flight (at most one at a time) and while no image is loaded.
 */
export const topBar = (
  h: HtmlBuilder<EditorMessage>,
  saveStatus: Model['saveStatus'],
  attachedEdit: Model['attachedEdit'],
  hasImage: boolean,
) => {
  const saving = saveStatus._tag === 'saving'
  const attachedId = attachedEdit?.id ?? null
  return h.header(
    [h.Class('flex items-center justify-between border-b border-border bg-panel px-4 py-2')],
    [
      h.h1([h.Class('text-sm font-semibold tracking-[0.3em] text-accent')], ['LUTRA']),
      h.div(
        [h.Class('flex items-center gap-1')],
        [
          saveStatusText(h, saveStatus),
          button(
            {
              onClick: EditorMessage.SaveRequested(),
              isDisabled: !hasImage || saving,
              size: 'xs',
              className: 'disabled:opacity-30',
              attributes: [h.AriaLabel('Save edit')],
            },
            saving ? 'Saving…' : 'Save',
            h,
          ),
          button(
            {
              onClick: EditorMessage.SaveAsRequested(),
              isDisabled: !hasImage || saving || attachedId === null,
              variant: 'ghost',
              size: 'xs',
              className: 'disabled:opacity-30',
              attributes: [h.AriaLabel('Save as a new edit')],
            },
            [
              h.span([h.Class('hidden sm:inline')], ['Save as']),
              h.span(
                [h.Class('grid size-8 place-items-center sm:hidden')],
                [icon(h, CopyPlus, 'Save as a new edit')],
              ),
            ],
            h,
          ),
          button(
            {
              onClick: EditorMessage.ExportRequested(),
              isDisabled: !hasImage,
              variant: 'ghost',
              size: 'icon-sm',
              className: 'disabled:opacity-30',
              attributes: [h.AriaLabel('Export image')],
            },
            [icon(h, Download, 'Export')],
            h,
          ),
          button(
            {
              onClick: EditorMessage.ClearedImage(),
              isDisabled: !hasImage,
              variant: 'ghost',
              size: 'xs',
              className: 'disabled:opacity-30',
              attributes: [h.AriaLabel('Start over')],
            },
            [
              h.span([h.Class('hidden sm:inline')], ['New']),
              h.span(
                [h.Class('grid size-8 place-items-center sm:hidden')],
                [icon(h, Plus, 'Start over')],
              ),
            ],
            h,
          ),
        ],
      ),
    ],
  )
}

/**
 * The save flow's status line: the last successful save's time (the gallery
 * tile carries the same `savedAt`) or the last failure's reason. Nothing
 * while idle or saving — the Save button's "Saving…" label covers that.
 */
const saveStatusText = (h: HtmlBuilder<EditorMessage>, saveStatus: Model['saveStatus']) =>
  Match.value(saveStatus).pipe(
    Match.withReturnType<Html>(),
    Match.when({ _tag: 'saved' }, (status) =>
      h.span(
        [h.Class('hidden pr-1 text-[10px] text-muted sm:inline')],
        [`Saved ${DateTime.formatLocal({ timeStyle: 'short' })(DateTime.makeUnsafe(status.at))}`],
      ),
    ),
    Match.when({ _tag: 'failed' }, (status) =>
      h.span(
        [h.Class('hidden pr-1 text-[10px] text-accent sm:inline'), h.Title(status.error.message)],
        ['Save failed'],
      ),
    ),
    Match.orElse(() => null),
  )
