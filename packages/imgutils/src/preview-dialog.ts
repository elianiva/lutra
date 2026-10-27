import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Dialog from '@/components/ui/dialog'
import { outputName } from './command'
import { formatBytes } from './format'
import { Message } from './message'
import type { Model } from './model'

/** Before and after for one finished photo, side by side. */
export const previewDialog = (h: HtmlBuilder<Message>, model: Model): Html => {
  const item = model.items.find((candidate) => candidate.id === model.previewId)
  const done = item?.status._tag === 'Done' ? item.status : null
  return h.submodel({
    model: model.previewDialog,
    slotId: model.previewDialog.id,
    toParentMessage: (message) => Message.GotPreviewDialogMessage({ message }),
    view: Dialog.view,
    viewInputs: Dialog.styledViewInputs(
      {
        panelClass:
          'surface-raised w-[min(1040px,calc(100vw-2rem))] max-h-[90dvh] overflow-y-auto border-0 bg-s3 p-0',
        content: ({ title, closeButton }, dialogH) =>
          item === undefined || done === null
            ? []
            : [
                dialogH.div(
                  [dialogH.Class('grid gap-3 p-3 sm:grid-cols-2')],
                  [
                    figure(dialogH, 'Original', item.sourceUrl, [
                      `${done.result.sourceWidth} × ${done.result.sourceHeight}`,
                      formatBytes(item.file.size),
                    ]),
                    figure(dialogH, 'Output', done.result.url, [
                      `${done.result.width} × ${done.result.height}`,
                      formatBytes(done.result.blob.size),
                    ]),
                  ],
                ),
                dialogH.div(
                  [dialogH.Class('flex items-center justify-between gap-3 px-4 pb-3')],
                  [
                    Dialog.title(
                      {
                        attributes: title,
                        className: 'truncate font-mono text-xs font-normal text-muted',
                      },
                      [outputName(item.file, done.result)],
                      dialogH,
                    ),
                    dialogH.button(
                      [
                        ...closeButton,
                        dialogH.Class(
                          'flex h-8 flex-none items-center rounded-full px-3 text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:bg-s2 hover:text-ink',
                        ),
                      ],
                      ['Close'],
                    ),
                  ],
                ),
              ],
      },
      h,
    ),
  })
}

const figure = <M>(
  h: HtmlBuilder<M>,
  caption: string,
  src: string,
  meta: ReadonlyArray<string>,
): Html =>
  h.figure(
    [h.Class('flex min-w-0 flex-col gap-2')],
    [
      h.div(
        [h.Class('well relative aspect-[4/3] overflow-hidden')],
        [
          h.img([
            h.Src(src),
            h.Alt(caption),
            h.Class('absolute inset-0 size-full object-contain p-2'),
          ]),
        ],
      ),
      h.figcaption(
        [h.Class('flex items-baseline justify-between gap-3 px-1')],
        [
          h.span([h.Class('label')], [caption]),
          h.span([h.Class('font-mono text-[10px] tnum text-ink')], [meta.join(' · ')]),
        ],
      ),
    ],
  )
