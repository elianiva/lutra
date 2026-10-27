import type { Html, HtmlBuilder } from 'foldkit/html'
import { Eclipse, LayoutGrid, Sun, Wrench } from 'lucide'
import type { Mode } from '../theme'
import { icon } from './icon'

/** The site's pages. Each is its own document, so moving between them is a page load. */
export type Page = 'edits' | 'tools'

const PAGES = [
  { page: 'edits', label: 'Edits', glyph: LayoutGrid },
  { page: 'tools', label: 'Tools', glyph: Wrench },
] as const

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
  const modeSegment = (target: Mode, label: string, glyph: typeof Sun) =>
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
        'surface-raised fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full! p-1.5',
      ),
      h.AriaLabel('Navigation'),
    ],
    [
      h.span(
        [
          h.Class(
            'mx-1 grid h-8 w-8 place-items-center rounded-[10px] bg-accent-soft font-bold text-signal',
          ),
        ],
        ['L'],
      ),
      h.span([h.Class('seam-v mx-1.5 h-4')], []),
      ...PAGES.map(({ page, label, glyph }) =>
        page === config.current
          ? h.span(
              [
                h.Class(
                  'flex h-9 items-center gap-2 rounded-full bg-s2 px-4 text-[11px] uppercase tracking-[0.1em] text-ink',
                ),
                h.AriaCurrent('page'),
              ],
              [icon(h, glyph, label, 15), label],
            )
          : h.button(
              [
                h.Type('button'),
                h.Class(
                  'flex h-9 items-center gap-2 rounded-full px-4 text-[11px] uppercase tracking-[0.1em] text-muted transition-colors hover:bg-s2 hover:text-ink',
                ),
                h.OnClick(config.onNavigate(page)),
              ],
              [icon(h, glyph, label, 15), label],
            ),
      ),
      h.span([h.Class('seam-v mx-1.5 h-4')], []),
      h.div(
        [
          h.Class('well flex items-center gap-0.5 rounded-full! p-[3px]'),
          h.AriaLabel('Appearance'),
        ],
        [modeSegment('light', 'Light', Sun), modeSegment('dark', 'Dark', Eclipse)],
      ),
    ],
  )
}

/** Where each page lives on the site. */
export const pageUrl = (page: Page): string => (page === 'tools' ? '/tools/' : '/')
