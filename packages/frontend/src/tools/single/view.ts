import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'
import { ImageUp } from 'lucide'
import { icon } from '@/components/icon'
import { pillButton } from '@/tools/controls'
import { cn } from '@/lib/utils'
import { outputName } from '../command'
import { formatBytes } from '../format'
import { Message } from '../message'
import type { Item, Model } from '../model'

/**
 * Single mode's workspace: the drop target, the batch progress and the result
 * cards. Each card shows the item's state, its size change and its own save.
 */
const lazyCard = createKeyedLazy()

export const singleView = (h: HtmlBuilder<Message>, model: Model): Html => {
  const working = model.items.filter((item) => item.status._tag === 'Working').length
  return h.div(
    [h.Class('flex min-w-0 flex-1 flex-col gap-5')],
    [
      dropZone(h, model.items.length === 0),
      working === 0 ? null : progress(h, model.items.length - working, model.items.length),
      model.items.length === 0
        ? null
        : h.ul(
            [
              h.Class(
                'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5 max-sm:grid-cols-2 max-sm:gap-3',
              ),
              h.AriaLabel('Results'),
            ],
            model.items.map((item) => lazyCard(String(item.id), cardView, [item, h])!),
          ),
    ],
  )
}

const dropZone = (h: HtmlBuilder<Message>, empty: boolean): Html =>
  h.button(
    [
      h.Type('button'),
      h.Class(
        cn(
          'well group flex w-full items-center justify-center gap-4 text-muted transition-colors hover:text-ink',
          empty ? 'min-h-[320px] flex-col' : 'h-20',
        ),
      ),
      h.OnClick(Message.AddRequested()),
      h.DataAttribute('drop-zone', 'true'),
    ],
    [
      h.span(
        [
          h.Class(
            cn(
              'grid place-items-center rounded-full bg-s1 text-accent shadow-[inset_0_1px_0_var(--mat-rim),var(--mat-elev-1)]',
              empty ? 'size-14' : 'size-10',
            ),
          ),
        ],
        [icon(h, ImageUp, 'Add images', empty ? 24 : 18)],
      ),
      h.span(
        [h.Class(cn(empty ? 'text-sm text-ink' : 'text-[13px]'))],
        ['Drop images here or choose files'],
      ),
    ],
  )

const progress = (h: HtmlBuilder<Message>, done: number, total: number): Html =>
  h.div(
    [h.Class('flex items-center gap-4'), h.Role('status')],
    [
      h.div(
        [h.Class('h-1 flex-1 overflow-hidden rounded-full bg-[var(--mat-track)]')],
        [
          h.div(
            [
              h.Class('track-fill h-full transition-[width] duration-200'),
              h.Style({ width: `${Math.round((done / total) * 100)}%` }),
            ],
            [],
          ),
        ],
      ),
      h.span([h.Class('label tnum')], [`${done} / ${total}`]),
    ],
  )

const badge = (h: HtmlBuilder<Message>, text: string, tone: 'neutral' | 'accent'): Html =>
  h.span(
    [
      h.Class(
        cn(
          'pill absolute left-2 top-2 px-2 py-1 text-[9px] uppercase tracking-[0.14em]',
          tone === 'accent' ? 'text-accent' : 'text-muted',
        ),
      ),
    ],
    [text],
  )

const cardView = (item: Item, h: HtmlBuilder<Message>): Html => card(h, item)

const card = (h: HtmlBuilder<Message>, item: Item): Html => {
  const { status } = item
  const done = status._tag === 'Done' ? status : null
  return h.li(
    [
      h.Key(String(item.id)),
      h.DataAttribute('status', status._tag),
      h.Class('surface flex min-w-0 flex-col overflow-hidden'),
    ],
    [
      h.button(
        [
          h.Type('button'),
          h.Class(
            'relative m-1.5 aspect-[4/3] overflow-hidden rounded-[14px] bg-[var(--mat-stage)]',
          ),
          h.OnClick(Message.PreviewRequested({ id: item.id })),
          h.AriaLabel(`Compare ${item.file.name}`),
          ...(done === null ? [h.Disabled(true)] : []),
        ],
        [
          status._tag === 'Failed'
            ? null
            : h.img([
                h.Src(done === null ? item.sourceUrl : done.result.url),
                h.Alt(''),
                h.Class(
                  cn(
                    'size-full object-contain transition-opacity',
                    done === null || done.stale ? 'opacity-40' : '',
                  ),
                ),
              ]),
          status._tag === 'Working'
            ? badge(h, 'Working', 'neutral')
            : status._tag === 'Failed'
              ? badge(h, 'Failed', 'accent')
              : status.stale
                ? badge(h, 'Stale', 'accent')
                : null,
        ],
      ),
      h.div(
        [h.Class('flex min-w-0 flex-1 flex-col gap-1 px-3 pb-1 pt-1.5')],
        [
          h.p(
            [h.Class('truncate text-[13px] text-ink'), h.Title(item.file.name)],
            [item.file.name],
          ),
          ...(status._tag === 'Failed'
            ? [h.p([h.Class('text-[11px] leading-snug text-accent')], [status.error])]
            : done === null
              ? [
                  h.p(
                    [h.Class('font-mono text-[10px] tnum text-dim')],
                    [formatBytes(item.file.size)],
                  ),
                ]
              : [
                  h.p(
                    [h.Class('font-mono text-[10px] tnum text-muted')],
                    [
                      `${done.result.sourceWidth}×${done.result.sourceHeight} → ${done.result.width}×${done.result.height}`,
                    ],
                  ),
                  h.p(
                    [h.Class('font-mono text-[10px] tnum text-muted')],
                    [`${formatBytes(item.file.size)} → ${formatBytes(done.result.blob.size)}`],
                  ),
                ]),
        ],
      ),
      h.div(
        [h.Class('flex justify-end px-1.5 pb-1.5')],
        [
          done !== null
            ? h.a(
                [
                  h.Href(done.result.url),
                  h.Download(outputName(item.file, done.result)),
                  h.Class(
                    'flex h-8 items-center rounded-full px-3 text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:bg-s2 hover:text-ink',
                  ),
                ],
                ['Save'],
              )
            : status._tag === 'Failed'
              ? pillButton(h, {
                  label: ['Retry'],
                  onClick: Message.RetryRequested({ id: item.id }),
                })
              : h.span([h.Class('h-8')], []),
        ],
      ),
    ],
  )
}
