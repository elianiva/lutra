import type { HtmlBuilder } from 'foldkit/html'
import { Check } from 'lucide'
import type { EditorMessage } from '../message'
import { PreviewedLut } from '../message'
import type { LutCatalogEntry } from '../../luts/store'
import type { LutDownloadState } from '../../offline/model'
import { icon } from '../../components/icon'

/**
 * One filmstrip thumb. `src` is the per-photo preview (docs/adr/0013) once
 * it has rendered, else the vendored generic jpg — the placeholder and the
 * failure fallback, so a thumb always shows something.
 *
 * The committed LUT of the active target gets the accent border and a
 * centered check badge (the border alone is easy to miss on dark thumbs,
 * especially at a glance while scrubbing). The badge is decorative — the
 * button's aria-pressed carries the state for screen readers.
 *
 * The offline library (docs/adr/0015) decorates the row: while the cube is
 * being fetched a spinner overlays the thumb; while the device is offline an
 * undownloaded cube is dimmed with a "not downloaded" badge and its click
 * routes to the distinct OfflineLutUnavailable notice instead of a commit
 * (the bar decides that — see lut-bar/bar.ts's commit closure).
 */
export const thumb = (
  h: HtmlBuilder<EditorMessage>,
  entry: LutCatalogEntry,
  src: string,
  current: boolean,
  downloadState: LutDownloadState,
  online: boolean,
  onPick: () => EditorMessage,
) => {
  const unavailable = online === false && downloadState !== 'downloaded'
  return h.button(
    [
      h.OnClick(onPick()),
      h.OnMouseEnter(PreviewedLut({ lutId: entry.lut_file })),
      h.OnMouseLeave(PreviewedLut({ lutId: null })),
      h.AriaLabel(
        unavailable
          ? `Apply ${entry.name} — not downloaded, needs a connection`
          : `Apply ${entry.name}`,
      ),
      h.Title(
        unavailable ? `${entry.name} — not downloaded yet` : entry.name,
      ),
      h.AriaPressed(String(current)),
      // Keyed by lutId: the Recents strip reorders on every commit (MRU
      // bump), and an unkeyed list would patch DOM nodes positionally —
      // the node under the cursor would silently start representing a
      // different LUT, so hover/click commit the wrong entry. With the
      // key, snabbdom moves each thumb's node to its data position and
      // hover state stays glued to the LUT it shows.
      h.Key(entry.lut_file),
      h.Class(
        `relative size-24 shrink-0 overflow-hidden border-2 border-bg ${current ? 'border-accent' : 'border-border'}`,
      ),
    ],
    [
      h.img([
        h.Src(src),
        h.Alt(entry.name),
        h.Loading('lazy'),
        h.Class(
          `size-full object-cover ${unavailable ? 'opacity-40' : ''}`,
        ),
      ]),
      // The cube is being mirrored into the offline library right now.
      ...(downloadState === 'fetching'
        ? [
            h.div(
              [h.Class('absolute inset-0 flex items-center justify-center bg-black/40')],
              [
                h.span([
                  h.Class(
                    'size-5 animate-spin rounded-full border-2 border-white/30 border-t-accent',
                  ),
                ], []),
              ],
            ),
          ]
        : []),
      // Offline and the cube isn't cached: dimmed + a badge instead of a
      // silent failure on click.
      ...(unavailable
        ? [
            h.div(
              [
                h.Class(
                  'absolute inset-x-1 bottom-1 rounded bg-black/70 px-1 py-0.5 text-center text-[9px] leading-tight text-white/80',
                ),
              ],
              ['not downloaded'],
            ),
          ]
        : []),
      // The committed LUT of the active target: accent border + centered
      // check badge — the active row must read at a glance while scrubbing
      // (the border alone disappears on dark thumbs). Decorative: the
      // button's aria-pressed already tells screen readers. Last in DOM so
      // the badge stays on top of the spinner and offline dimming.
      ...(current
        ? [
            h.div(
              [h.Class('absolute inset-0 flex items-center justify-center')],
              [
                h.div(
                  [
                    h.Class('flex size-6 items-center justify-center bg-accent text-ink'),
                    h.Attribute('data-testid', 'current-lut-check'),
                  ],
                  [icon(h, Check, 'Current LUT', 16)],
                ),
              ],
            ),
          ]
        : []),
    ],
  )
}
