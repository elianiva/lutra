import type { HtmlBuilder } from 'foldkit/html'
import type { EditorMessage } from '../message'
import { PreviewedLut } from '../message'
import type { LutCatalogEntry } from '../../luts/store'
import type { LutDownloadState } from '../../offline/model'

/**
 * One filmstrip thumb. `src` is the per-photo preview (docs/adr/0013) once
 * it has rendered, else the vendored generic jpg — the placeholder and the
 * failure fallback, so a thumb always shows something.
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
    ],
  )
}
