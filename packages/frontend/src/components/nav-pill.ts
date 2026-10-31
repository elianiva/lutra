import type { Html, HtmlBuilder } from 'foldkit/html'
import type { IconNode } from './icon'
import { Edits, ModeDark, ModeLight, Tools } from './icons'
import type { Mode } from '../theme'
import { cn } from '@/lib/utils'
import { icon } from './icon'
import * as Tabs from './ui/tabs'
import { mark } from './wordmark'

/** The site's pages. Each is its own document, so moving between them is a page load. */
export type Page = 'edits' | 'tools'

const PAGES = [
  { page: 'edits', label: 'Edits', glyph: Edits },
  { page: 'tools', label: 'Tools', glyph: Tools },
] as const

const tabClass =
  'z-10 h-9 gap-1.5 rounded-full px-3 sm:gap-2 sm:px-4 text-[11px] uppercase tracking-[0.1em] text-muted hover:text-ink data-selected:bg-transparent data-selected:text-ink dark:text-muted dark:hover:text-ink dark:data-selected:border-transparent dark:data-selected:bg-transparent dark:data-selected:text-ink'

/**
 * The floating navigation (docs/adr/0013-materials): logo, the site's pages,
 * and the appearance switch. Bottom-centre so the content keeps the full
 * width. The gallery and the tools page both draw it, with their own page
 * current.
 */
export const navPill = <M>(
  h: HtmlBuilder<M>,
  config: Readonly<{
    current: Page
    mode: Mode
    onToggleMode: M
    onNavigate: (page: Page) => M
  }>,
): Html => {
  const modeSegment = (target: Mode, label: string, glyph: IconNode) =>
    h.button(
      [
        h.Type('button'),
        h.Class(
          `grid h-7 w-7 place-items-center rounded-full transition-colors ${
            config.mode === target ? 'bg-accent text-accent-ink' : 'text-dim hover:text-ink'
          }`,
        ),
        h.OnClick(config.onToggleMode),
        h.AriaLabel(`${label} appearance`),
        h.AriaPressed(String(config.mode === target)),
        h.Title(`${label} appearance`),
      ],
      [icon(h, glyph, label, 14)],
    )
  return h.nav(
    [
      h.Class(
        'surface-raised fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100vw-1rem)] [view-transition-name:nav] items-center gap-1.5 rounded-full! p-1.5',
      ),
      h.AriaLabel('Navigation'),
    ],
    [
      h.span(
        [h.Class('mx-1 grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-ink')],
        [mark(h, 'block h-4 w-auto')],
      ),
      Tabs.list(
        { className: 'h-auto grid-flow-col auto-cols-fr grid rounded-none bg-transparent p-0' },
        [
          Tabs.indicator(
            {
              index: PAGES.findIndex(({ page }) => page === config.current),
              count: PAGES.length,
              pad: 0,
              className: 'rounded-full bg-s2 shadow-none [view-transition-name:nav-tab]',
            },
            h,
          ),
          ...PAGES.map(({ page, label, glyph }) =>
            h.button(
              [
                h.Type('button'),
                h.Role('tab'),
                h.AriaSelected(page === config.current),
                h.DataAttribute('slot', 'tabs-trigger'),
                ...(page === config.current ? [h.DataAttribute('selected', '')] : []),
                h.Class(cn(Tabs.tabsTriggerClass, tabClass)),
                // Its own transition group, painted above the sliding pill (groups
                // stack in document order) so the labels stay readable mid-slide.
                h.Style({ 'view-transition-name': `nav-label-${page}` }),
                ...(page === config.current ? [] : [h.OnClick(config.onNavigate(page))]),
              ],
              [icon(h, glyph, label, 15), label],
            ),
          ),
        ],
        h,
      ),
      h.div(
        [
          h.Class('well flex items-center gap-0.5 rounded-full! p-[3px]'),
          h.AriaLabel('Appearance'),
        ],
        [modeSegment('light', 'Light', ModeLight), modeSegment('dark', 'Dark', ModeDark)],
      ),
    ],
  )
}

/** Where each page lives on the site. */
export const pageUrl = (page: Page): string => (page === 'tools' ? '/app/tools' : '/app')
