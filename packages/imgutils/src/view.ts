import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { Archive, Eclipse, ImagePlus, RefreshCw, Sun, Upload } from 'lucide'
import { icon } from '@/components/icon'
import { pillButton } from '@/components/controls'
import { cn } from '@/lib/utils'
import { collageView } from './collage/view'
import { formatBytes } from './format'
import { Message } from './message'
import type { Model, Tab } from './model'
import { previewDialog } from './preview-dialog'
import { settingsPanel } from './settings-panel'
import { singleView } from './single/view'
import { reprocessTargets } from './update'

/**
 * The imgutils shell, in the Lutra materials (docs/adr/0013-materials): the
 * wordmark, the mode tabs and the actions float in a header with no rule;
 * the settings panel floats at the left; the workspace takes the rest. Below
 * `lg` the panel collapses and the actions dock to the bottom edge.
 */
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'imgutils',
  body: h.div(
    [
      h.Class('relative flex min-h-full flex-col bg-bg text-ink'),
      h.OnDragEnter(Message.DragEntered()),
      h.OnDragOver(Message.DragEntered()),
      h.OnDragLeave(Message.DragLeft()),
      h.AllowDrop(),
      h.OnDropFiles((files) => Message.FilesDropped({ files: [...files] })),
    ],
    [
      header(h, model),
      h.main(
        [
          h.Class(
            cn(
              'flex flex-1 flex-col gap-5 px-3 pb-6 sm:px-6 lg:flex-row lg:items-start lg:gap-6',
              model.tab === 'single' ? 'max-lg:pb-24' : '',
            ),
          ),
        ],
        [
          settingsPanel(h, model),
          model.tab === 'single' ? singleView(h, model) : collageView(h, model),
        ],
      ),
      previewDialog(h, model),
      model.dragOver ? dropOverlay(h, model.tab) : null,
    ],
  ),
})

const summary = (model: Model): string => {
  if (model.tab === 'collage' || model.items.length === 0) return ''
  const done = model.items.flatMap((item) => (item.status._tag === 'Done' ? [item.status] : []))
  const input = model.items.reduce((sum, item) => sum + item.file.size, 0)
  const output = done.reduce((sum, status) => sum + status.result.blob.size, 0)
  return `${done.length}/${model.items.length} ready · ${formatBytes(input)} → ${formatBytes(output)}`
}

const header = (h: HtmlBuilder<Message>, model: Model): Html =>
  h.header(
    [h.Class('flex h-16 flex-none items-center gap-3 px-3 sm:gap-6 sm:px-6')],
    [
      h.h1(
        [h.Class('flex-none text-xs font-semibold tracking-[0.34em] text-signal')],
        ['IMGUTILS'],
      ),
      tabs(h, model.tab),
      h.p([h.Class('micro tnum hidden font-mono xl:block')], [summary(model)]),
      h.div(
        [h.Class('ml-auto flex items-center gap-3')],
        [modeToggle(h, model.mode), model.tab === 'single' ? actions(h, model) : null],
      ),
    ],
  )

const tabs = (h: HtmlBuilder<Message>, active: Tab): Html =>
  h.div(
    [h.Class('surface flex h-10 items-center gap-0.5 p-1'), h.Role('tablist'), h.AriaLabel('Mode')],
    (['single', 'collage'] as const).map((tab) =>
      h.button(
        [
          h.Type('button'),
          h.Role('tab'),
          h.AriaSelected(tab === active),
          h.Class(
            cn(
              'flex h-8 items-center rounded-full px-3 text-[10px] uppercase tracking-[0.1em] transition-colors sm:px-4',
              tab === active ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink',
            ),
          ),
          h.OnClick(Message.SelectedTab({ tab })),
        ],
        [tab === 'single' ? 'Batch' : 'Collage'],
      ),
    ),
  )

const modeToggle = (h: HtmlBuilder<Message>, mode: Model['mode']): Html => {
  const segment = (target: Model['mode'], text: string, glyph: typeof Sun) =>
    h.button(
      [
        h.Type('button'),
        h.Class(
          cn(
            'grid h-8 w-9 place-items-center rounded-full transition-colors',
            mode === target ? 'bg-accent-soft text-accent' : 'text-dim hover:text-ink',
          ),
        ),
        h.OnClick(Message.ToggledMode()),
        h.AriaLabel(`${text} appearance`),
        h.AriaPressed(String(mode === target)),
      ],
      [icon(h, glyph, text, 16)],
    )
  return h.div(
    [h.Class('surface hidden h-10 items-center gap-0.5 p-1 sm:flex'), h.AriaLabel('Appearance')],
    [segment('dark', 'Dark', Eclipse), segment('light', 'Light', Sun)],
  )
}

/** The batch actions. They float in the header, and dock to the bottom on a phone. */
const actions = (h: HtmlBuilder<Message>, model: Model): Html => {
  const targets = reprocessTargets(model.items)
  const stale = targets.some((item) => item.status._tag === 'Done')
  const busy = model.items.some((item) => item.status._tag === 'Working')
  const ready = model.items.some((item) => item.status._tag === 'Done')
  return h.div(
    [
      h.Class(
        'surface flex h-10 items-center gap-0.5 p-1 max-lg:fixed max-lg:inset-x-3 max-lg:bottom-3 max-lg:z-30 max-lg:h-12 max-lg:justify-between max-lg:rounded-full',
      ),
    ],
    [
      targets.length === 0
        ? null
        : pillButton(h, {
            label: [
              icon(h, RefreshCw, 'Reprocess', 14),
              `${stale ? 'Reprocess' : 'Retry'} ${targets.length}`,
            ],
            onClick: Message.ReprocessRequested(),
            isDisabled: busy,
            className: 'text-accent',
          }),
      pillButton(h, {
        label: [
          icon(h, Archive, 'Download zip', 14),
          h.span([h.Class('max-sm:hidden')], ['Download .zip']),
          h.span([h.Class('sm:hidden')], ['Zip']),
        ],
        onClick: Message.ZipRequested(),
        isDisabled: !ready || model.zipping,
        ariaLabel: 'Download all as .zip',
      }),
      pillButton(h, {
        label: ['Clear'],
        onClick: Message.ClearRequested(),
        isDisabled: model.items.length === 0,
      }),
      pillButton(h, {
        label: [icon(h, ImagePlus, 'Add', 14), 'Add images'],
        onClick: Message.AddRequested(),
        primary: true,
      }),
    ],
  )
}

const dropOverlay = (h: HtmlBuilder<Message>, tab: Tab): Html =>
  h.div(
    [
      h.Class(
        'pointer-events-none fixed inset-3 z-50 flex flex-col items-center justify-center gap-3 rounded-[24px] bg-bg/80 shadow-[inset_0_0_0_2px_var(--mat-accent)] backdrop-blur-sm',
      ),
      h.DataAttribute('drop-overlay', 'true'),
    ],
    [
      h.span(
        [h.Class('pill grid size-16 place-items-center text-accent')],
        [icon(h, Upload, 'Drop images', 28)],
      ),
      h.p(
        [h.Class('text-sm font-semibold tracking-wide text-accent')],
        [tab === 'single' ? 'Drop to process' : 'Drop to add to the collage'],
      ),
    ],
  )
