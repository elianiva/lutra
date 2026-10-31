import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { cn } from '@/lib/utils'
import { icon } from '@/components/icon'
import { Reset } from '@/components/icons'
import { button } from '@/components/ui/button'
import { badge } from '@/components/ui/badge'
import * as Tabs from '@/components/ui/tabs'
import { lutraRangeRow } from '@/components/lutra-range-row'
import { wordmark } from '@/components/wordmark'
import { CATEGORIES, FILMS } from './films'
import { Message } from './message'
import type { Model } from './model'

/**
 * The landing page (docs/adr/0015-landing). It speaks the app's own language:
 * hairline rules, a square grid, soft surfaces, red keys, Chakra Petch. What
 * breaks is the layout, not the style: cards cross the rails and the rows, and
 * sit off the grid, while the rails themselves follow you down the page. The
 * app's real components (range rows, tabs, badges, buttons, the inspector and
 * dock surfaces) are the content.
 */

type H = HtmlBuilder<Message>

const mono = 'font-mono text-[10px] uppercase tracking-[0.16em] text-muted'

/** The app's primary action: the red keycap pill. */
const keyButton = (h: H, label: string, onClick: Message, className = ''): Html =>
  button(
    {
      onClick,
      className: cn(
        'key h-12 rounded-full px-7 text-[11px] uppercase tracking-[0.14em] text-accent-ink',
        className,
      ),
    },
    label,
    h,
  )

const sectionHead = (h: H, label: string, title: string): Html =>
  h.div(
    [h.Class('px-6 pb-8 pt-12 sm:px-10')],
    [
      h.span([h.Class(mono)], [label]),
      h.h2(
        [
          h.Class(
            'mt-3 max-w-[14em] text-[clamp(30px,4.6vw,56px)] font-medium leading-[1.02] tracking-tight',
          ),
        ],
        [title],
      ),
    ],
  )

/** The rails that follow you down the page, each with a pulse that travels it as you scroll. */
const rails = (h: H): Html =>
  h.div(
    [h.Class('lp-rails'), h.AriaHidden(true)],
    [
      h.div(
        [],
        [
          h.div([h.Class('lp-rail left-0')], [h.div([h.Class('lp-tick')], [])]),
          h.div(
            [h.Class('lp-rail right-0')],
            [h.div([h.Class('lp-tick'), h.DataAttribute('up', '')], [])],
          ),
        ],
      ),
    ],
  )

/* ---------- top bar ---------- */

const topBar = (h: H): Html =>
  h.header(
    [h.Class('lp-row flex h-16 items-center justify-between px-6 sm:px-10')],
    [
      wordmark(h, 'h-[18px] w-auto text-ink'),
      h.nav(
        [h.Class(cn(mono, 'hidden gap-8 md:flex'))],
        [
          h.a([h.Href('#try'), h.Class('hover:text-ink')], ['Try it']),
          h.a([h.Href('#features'), h.Class('hover:text-ink')], ['Features']),
        ],
      ),
      keyButton(h, 'Open app', Message.PageRequested({ page: 'edits' }), 'h-9 px-5'),
    ],
  )

/* ---------- demo preview ---------- */

const BASE_PHOTO = '/landing/base.jpg'

/** The plain photo with the film look laid over it; strength is the look's opacity. */
const preview = (h: H, model: Model, className: string): Html => {
  const film = FILMS[model.film] ?? FILMS[0]!
  return h.div(
    [h.Class(cn('surface-raised p-3', className))],
    [
      h.div(
        [h.Class('relative aspect-square w-full overflow-hidden rounded-xl bg-well')],
        [
          h.img([
            h.Src(BASE_PHOTO),
            h.Alt('The sample photo, ungraded'),
            h.Class('absolute inset-0 h-full w-full object-cover'),
          ]),
          h.img([
            h.Key(film.thumb),
            h.Src(film.thumb),
            h.Alt(`The sample photo with ${film.name}`),
            h.Class('absolute inset-0 h-full w-full object-cover'),
            h.Style({ opacity: String(model.strength / 100) }),
          ]),
          // The same print through the engine's grain shader, faded in with the toggle.
          h.img([
            h.Key(film.grain),
            h.Src(film.grain),
            h.Alt(''),
            h.Class('absolute inset-0 h-full w-full object-cover transition-opacity duration-300'),
            h.Style({ opacity: model.grain ? String(model.strength / 100) : '0' }),
          ]),
          model.vignette
            ? h.div([
                h.Class('pointer-events-none absolute inset-0'),
                h.Style({
                  background:
                    'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.7) 100%)',
                }),
              ])
            : null,
        ],
      ),
      h.div(
        [h.Class('flex items-baseline justify-between gap-3 px-1 pb-1 pt-3')],
        [
          h.span([h.Class('serif text-2xl italic leading-none')], [film.name]),
          h.span([h.Class(mono)], [film.category]),
        ],
      ),
    ],
  )
}

const strengthRow = (h: H, model: Model): Html =>
  lutraRangeRow(h, {
    label: 'Film strength',
    display: `${String(Math.round(model.strength))}%`,
    min: 0,
    max: 100,
    step: 1,
    value: model.strength,
    onInput: (value) => Message.AdjustedStrength({ value }),
  })

/* ---------- hero ---------- */

const hero = (h: H, model: Model): Html =>
  h.section(
    [h.Class('lp-row relative z-20 px-6 pb-20 pt-14 sm:px-10 lg:min-h-[620px] lg:pb-28')],
    [
      h.div(
        [h.Class('lp-grid lp-grid-fade pointer-events-none absolute inset-0'), h.AriaHidden(true)],
        [],
      ),
      h.div(
        [h.Class('relative max-w-[760px]')],
        [
          h.span(
            [h.Class(cn(mono, 'mb-8 flex items-center gap-2'))],
            [h.span([h.Class('size-1.5 bg-accent')], []), 'Film color editing in your browser'],
          ),
          h.h1(
            [
              h.Class(
                'text-[clamp(44px,7.4vw,104px)] font-medium leading-[0.95] tracking-[-0.035em]',
              ),
            ],
            [
              'Make digital look like ',
              h.span([h.Class('serif font-normal italic text-accent')], ['film']),
              '.',
            ],
          ),
          h.p(
            [h.Class('mt-8 max-w-[28em] text-lg leading-snug text-muted')],
            [
              '296 film looks, from Portra to Kodachrome. Pick one, tune it, save it. Your photos never leave your device.',
            ],
          ),
          h.div(
            [h.Class('mt-10 flex flex-wrap gap-3')],
            [keyButton(h, 'Start editing', Message.PageRequested({ page: 'edits' }))],
          ),
        ],
      ),
      // Breaks the frame: the card hangs over the right rail and the row below.
      h.div(
        [
          h.Class(
            'relative mt-16 lg:absolute lg:-right-16 lg:top-14 lg:mt-0 lg:w-[440px] xl:-right-24',
          ),
        ],
        [
          preview(h, model, 'rotate-[1.5deg]'),
          h.div(
            [
              h.Class(
                'surface-raised -mt-10 ml-6 w-[min(300px,80%)] -rotate-2 px-4 pb-2 pt-3 lg:-ml-24 lg:mt-[-72px]',
              ),
            ],
            [strengthRow(h, model)],
          ),
        ],
      ),
    ],
  )

/* ---------- marquee ---------- */

const marquee = (h: H): Html => {
  const row = (hidden: boolean) =>
    h.div(
      [h.Class('flex shrink-0 items-center gap-8 pr-8'), ...(hidden ? [h.AriaHidden(true)] : [])],
      FILMS.flatMap((film) => [
        h.span([h.Class('whitespace-nowrap')], [film.name]),
        h.span([h.Class('size-1 shrink-0 bg-accent')], []),
      ]),
    )
  return h.div(
    [h.Class(cn(mono, 'lp-row flex overflow-hidden py-4'))],
    [
      h.div(
        [h.Class('flex animate-[marquee_70s_linear_infinite] motion-reduce:animate-none')],
        [row(false), row(true)],
      ),
    ],
  )
}

/* ---------- stats strip ---------- */

const STATS = [
  ['296', 'film looks'],
  ['13', 'adjustments'],
  ['0', 'uploads'],
  ['20+', 'RAW formats'],
] as const

const stats = (h: H): Html =>
  h.div(
    [h.Class('lp-row grid grid-cols-2 md:grid-cols-4')],
    STATS.map(([value, label]) =>
      h.div(
        [
          h.Class(
            'flex items-baseline gap-3 border-b border-r border-border px-6 py-4 last:border-r-0 sm:px-10 max-md:nth-[2n]:border-r-0 max-md:nth-last-[-n+2]:border-b-0 md:border-b-0',
          ),
        ],
        [
          h.span([h.Class('text-3xl font-medium tracking-tight tnum')], [value]),
          h.span([h.Class(mono)], [label]),
        ],
      ),
    ),
  )

/* ---------- the mini editor ---------- */

/** The film dock's category switch: the app's pill tabs. */
const categoryTabs = (h: H, model: Model): Html =>
  Tabs.list(
    { className: 'well grid h-auto w-full grid-flow-col auto-cols-fr rounded-full! p-0' },
    [
      Tabs.indicator(
        {
          index: CATEGORIES.indexOf(model.category),
          count: CATEGORIES.length,
          pad: 3,
          className: 'rounded-full bg-s3 shadow-sm',
        },
        h,
      ),
      ...CATEGORIES.map((category) =>
        h.button(
          [
            h.Type('button'),
            h.Role('tab'),
            h.AriaSelected(category === model.category),
            h.Class(
              cn(
                Tabs.tabsTriggerClass,
                'z-10 h-9 rounded-full px-2 text-[10px] uppercase tracking-[0.1em]',
                category === model.category ? 'text-ink' : 'text-muted',
              ),
            ),
            h.OnClick(Message.SelectedCategory({ category })),
          ],
          [category],
        ),
      ),
    ],
    h,
  )

const filmstrip = (h: H, model: Model): Html =>
  h.div(
    [h.Class('grid grid-cols-6 gap-2')],
    FILMS.flatMap((film, index) =>
      film.category === model.category
        ? [
            h.button(
              [
                h.Key(film.thumb),
                h.Type('button'),
                h.AriaLabel(film.name),
                h.AriaPressed(String(index === model.film)),
                h.Title(film.name),
                h.Class(
                  cn(
                    'aspect-square overflow-hidden rounded-[10px] transition-[transform,box-shadow] hover:-translate-y-0.5',
                    index === model.film
                      ? 'shadow-[0_0_0_2px_var(--mat-accent),0_0_0_5px_var(--mat-halo)]'
                      : 'opacity-85 hover:opacity-100',
                  ),
                ),
                h.OnClick(Message.SelectedFilm({ index })),
              ],
              [h.img([h.Src(film.thumb), h.Alt(''), h.Class('h-full w-full object-cover')])],
            ),
          ]
        : [],
    ),
  )

/** The editor's panel-footer key: flat when off, the red key when on. */
const footerKey = (
  h: H,
  label: string,
  on: boolean | null,
  onClick: Message,
  glyph?: typeof Reset,
): Html =>
  h.button(
    [
      h.Type('button'),
      h.Class(
        cn(
          'flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] text-[10px] uppercase tracking-[0.1em] transition-colors',
          on === true
            ? 'key bg-accent text-accent-ink'
            : 'bg-s2 text-dim hover:bg-s3 hover:text-ink',
        ),
      ),
      ...(on === null ? [] : [h.AriaPressed(String(on))]),
      h.OnClick(onClick),
    ],
    [...(glyph ? [icon(h, glyph, label, 14)] : []), label],
  )

/** The inspector: the editor's floating parameter panel. */
const inspector = (h: H, model: Model, className: string): Html =>
  h.div(
    [h.Class(cn('surface flex w-full flex-col overflow-hidden rounded-[18px]', className))],
    [
      h.div(
        [h.Class('micro flex items-center justify-between px-4 pt-4')],
        [h.span([], ['Film look']), h.span([], ['Live'])],
      ),
      h.div(
        [h.Class('flex flex-col gap-4 px-4 py-5')],
        [
          h.div(
            [h.Class('flex items-baseline justify-between gap-3')],
            [
              h.span(
                [h.Class('serif text-xl italic leading-none')],
                [(FILMS[model.film] ?? FILMS[0]!).name],
              ),
              h.span([h.Class(mono)], [(FILMS[model.film] ?? FILMS[0]!).category]),
            ],
          ),
          strengthRow(h, model),
        ],
      ),
      h.div(
        [h.Class('flex gap-1.5 px-3 pb-3')],
        [
          footerKey(h, 'Grain', model.grain, Message.ToggledGrain()),
          footerKey(h, 'Vignette', model.vignette, Message.ToggledVignette()),
          footerKey(h, 'Reset', null, Message.ResetAdjustments(), Reset),
        ],
      ),
    ],
  )

const dock = (h: H, model: Model, className: string): Html =>
  h.div(
    [h.Class(cn('surface-raised flex flex-col gap-3 rounded-[20px]! p-3', className))],
    [categoryTabs(h, model), filmstrip(h, model)],
  )

const workbench = (h: H, model: Model): Html =>
  h.section(
    [h.Id('try'), h.Class('lp-row relative z-10')],
    [
      sectionHead(h, '01 / Try it', 'Pick a film. Drag the strength.'),
      h.div(
        [h.Class('px-6 pb-24 sm:px-10')],
        [
          h.div(
            [
              h.Class(
                'relative flex flex-col gap-5 rounded-[28px] bg-[var(--mat-stage)] p-4 shadow-[inset_0_1px_3px_var(--mat-inset)] lg:-mx-8 lg:flex-row lg:items-start lg:gap-0 lg:p-10',
              ),
            ],
            [
              // The photo with the untouched original pinned to its corner.
              h.div(
                [h.Class('relative lg:w-[50%]')],
                [
                  preview(h, model, 'lg:-rotate-1'),
                  h.div(
                    [
                      h.Class(
                        'surface-raised absolute -bottom-5 -right-3 w-24 rotate-[4deg] p-1.5 max-lg:hidden',
                      ),
                    ],
                    [
                      h.img([
                        h.Src(BASE_PHOTO),
                        h.Alt('Original'),
                        h.Class('aspect-square w-full rounded-md object-cover'),
                      ]),
                      h.span([h.Class('micro block px-0.5 pb-0.5 pt-1.5')], ['Original']),
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Class('flex flex-col gap-4 lg:-mr-14 lg:-ml-6 lg:mt-14 lg:w-[50%]')],
                [
                  inspector(h, model, 'lg:rotate-1'),
                  dock(h, model, 'lg:-mb-16 lg:-ml-24 lg:-rotate-1'),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )

/* ---------- features ---------- */

const cellClass = 'relative flex flex-col gap-3 bg-bg p-6 sm:p-8'

const bigNumber = (h: H, value: string): Html =>
  h.span(
    [
      h.Class(
        'block text-[clamp(64px,9vw,128px)] font-medium leading-[0.85] tracking-[-0.05em] text-accent',
      ),
    ],
    [value],
  )

const cellTitle = (h: H, text: string): Html =>
  h.h3([h.Class('text-2xl font-medium leading-tight tracking-tight sm:text-3xl')], [text])

const copy = (h: H, text: string): Html =>
  h.p([h.Class('max-w-xs text-base leading-snug text-muted')], [text])

const ADJUSTMENTS = [
  'Film look',
  'Exposure',
  'Contrast',
  'Shadows',
  'Highlights',
  'Tone Curve',
  'White Balance',
  'Saturation',
  'Color Mixer',
  'Grain',
  'Vignette',
  'Color Fringing',
  'Detail',
] as const

const features = (h: H): Html =>
  h.section(
    [h.Id('features'), h.Class('lp-row')],
    [
      sectionHead(h, '02 / Features', 'A short list, on purpose.'),
      h.div(
        [h.Class('grid border-t border-border md:grid-cols-6')],
        [
          h.div(
            [h.Class(cn(cellClass, 'border-b border-border md:col-span-3 md:border-r'))],
            [
              h.span([h.Class(mono)], ['Film looks']),
              bigNumber(h, '296'),
              cellTitle(h, 'Stocks to start from'),
              copy(
                h,
                'Negative, slide, print, instant and black & white. Try them on your own photo.',
              ),
            ],
          ),
          h.div(
            [h.Class(cn(cellClass, 'border-b border-border md:col-span-3'))],
            [
              h.span([h.Class(mono)], ['Privacy']),
              bigNumber(h, '0'),
              cellTitle(h, 'Uploads'),
              copy(h, 'Editing happens on your device. No account, no tracking.'),
            ],
          ),
          // Breaks the grid: the raised card rides up over the row above.
          h.div(
            [
              h.Class(
                'relative z-10 border-b border-border bg-bg p-6 sm:p-8 md:col-span-4 md:border-r',
              ),
            ],
            [
              h.div(
                [
                  h.Class(
                    'surface-raised flex flex-col gap-4 p-6 sm:p-8 md:-ml-12 md:-mt-14 md:-rotate-[0.6deg]',
                  ),
                ],
                [
                  h.span([h.Class(mono)], ['Adjustments']),
                  cellTitle(h, 'Thirteen, in a fixed order'),
                  copy(
                    h,
                    'A short list keeps you close to the film look instead of tweaking forever.',
                  ),
                  h.div(
                    [h.Class('flex flex-wrap gap-2')],
                    ADJUSTMENTS.map((name, index) =>
                      badge(
                        {
                          variant: index === 0 ? 'default' : 'secondary',
                          className: 'h-6 rounded-full px-3 text-[10px] uppercase tracking-[0.1em]',
                        },
                        [`${String(index + 1).padStart(2, '0')} ${name}`],
                        h,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [h.Class(cn(cellClass, 'border-b border-border md:col-span-2'))],
            [
              h.span([h.Class(mono)], ['Camera files']),
              cellTitle(h, 'RAW, straight from the camera'),
              copy(h, 'No converting first.'),
              h.div(
                [h.Class('flex flex-wrap gap-2')],
                ['CR3', 'NEF', 'ARW', 'RAF', 'DNG'].map((ext) =>
                  badge(
                    {
                      variant: 'outline',
                      className: 'h-6 rounded-full px-3 font-mono text-[10px] tracking-[0.1em]',
                    },
                    [ext],
                    h,
                  ),
                ),
              ),
            ],
          ),
          h.div(
            [h.Class(cn(cellClass, 'md:col-span-2 md:border-r md:border-border'))],
            [
              h.span([h.Class(mono)], ['Bulk tools']),
              cellTitle(h, 'Resize and collage'),
              copy(h, 'Shrink a whole folder in one go, or lay photos out in a collage.'),
              keyButton(
                h,
                'Open tools',
                Message.PageRequested({ page: 'tools' }),
                'mt-2 h-10 w-fit px-5',
              ),
            ],
          ),
          h.div(
            [
              h.Class(
                cn(
                  cellClass,
                  'md:col-span-4 md:flex-row md:items-center md:justify-between md:gap-10',
                ),
              ),
            ],
            [
              h.div(
                [h.Class('flex flex-col gap-3')],
                [
                  h.span([h.Class(mono)], ['Offline']),
                  cellTitle(h, 'Works without a connection'),
                  copy(h, 'Install it once and the whole film library stays with you.'),
                ],
              ),
              // The app's own offline card, finished.
              h.div(
                [h.Class('surface w-full max-w-[260px] shrink-0 px-4 py-3 md:rotate-1')],
                [
                  h.div(
                    [h.Class('flex items-baseline justify-between gap-3 text-sm text-ink')],
                    [h.span([], ['Offline library ready']), h.span([h.Class('tnum')], ['100%'])],
                  ),
                  h.div(
                    [h.Class('mt-2 h-1 w-full bg-border-strong')],
                    [h.div([h.Class('h-full w-full bg-accent')], [])],
                  ),
                  h.div([h.Class('tnum mt-1.5 text-xs text-muted')], ['593 / 593 files']),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )

/* ---------- closing ---------- */

/** A fan of four graded prints, one per shelf, overlapping like a contact sheet. */
const fan = (h: H): Html =>
  h.div(
    [h.Class('flex items-center justify-center pl-8 max-md:hidden')],
    [0, 6, 10, 14].flatMap((index, n) => {
      const film = FILMS[index]
      return film === undefined
        ? []
        : [
            h.figure(
              [
                h.Class('surface-raised -ml-12 w-40 shrink-0 p-2 first:ml-0 lg:w-44'),
                h.Style({
                  transform: `rotate(${String([-6, 3, -2, 5][n] ?? 0)}deg) translateY(${String([8, -14, 10, -6][n] ?? 0)}px)`,
                }),
              ],
              [
                h.img([
                  h.Src(film.thumb),
                  h.Alt(film.name),
                  h.Class('aspect-[4/5] w-full rounded-lg object-cover'),
                ]),
                h.figcaption([h.Class('micro px-0.5 pb-0.5 pt-1.5')], [film.category]),
              ],
            ),
          ]
    }),
  )

const closing = (h: H): Html =>
  h.section(
    [h.Class('lp-row relative overflow-hidden px-6 py-20 sm:px-10')],
    [
      h.div(
        [h.Class('lp-grid lp-grid-fade pointer-events-none absolute inset-0'), h.AriaHidden(true)],
        [],
      ),
      h.div(
        [h.Class('relative grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]')],
        [
          h.div(
            [h.Class('flex flex-col items-start gap-6')],
            [
              h.span([h.Class(mono)], ['03 / Start']),
              h.h2(
                [
                  h.Class(
                    'text-[clamp(36px,5.4vw,76px)] font-medium leading-[0.98] tracking-[-0.035em]',
                  ),
                ],
                [
                  'Your next photo, on ',
                  h.span([h.Class('serif font-normal italic text-accent')], ['film']),
                  '.',
                ],
              ),
              h.p(
                [h.Class('max-w-sm text-lg leading-snug text-muted')],
                ['Open a photo and the first look is one tap away.'],
              ),
              keyButton(h, 'Open Lutra', Message.PageRequested({ page: 'edits' }), 'h-12 px-9'),
            ],
          ),
          fan(h),
        ],
      ),
    ],
  )

const footer = (h: H): Html =>
  h.footer(
    [h.Class(cn(mono, 'flex items-center justify-between px-6 py-6 sm:px-10'))],
    [
      h.span([], ['© 2026 Lutra']),
      h.a([h.Href('https://github.com/elianiva/lutra'), h.Class('hover:text-ink')], ['GitHub']),
    ],
  )

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('relative h-full overflow-y-auto overflow-x-hidden bg-bg text-ink')],
    [
      h.div(
        [h.Class('relative mx-auto max-w-[1200px]')],
        [
          rails(h),
          topBar(h),
          hero(h, model),
          marquee(h),
          stats(h),
          workbench(h, model),
          features(h),
          closing(h),
          footer(h),
        ],
      ),
    ],
  ),
)
