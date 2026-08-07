import type { HtmlBuilder } from 'foldkit/html'
import type { EditorMessage } from '../message'
import { PreviewedLut } from '../message'
import type { LutCatalogEntry } from '../../luts/store'

/** One filmstrip thumb. `src` is the per-photo preview (docs/adr/0013) once
 *  it has rendered, else the vendored generic jpg — the placeholder and the
 *  failure fallback, so a thumb always shows something. */
export const thumb = (
  h: HtmlBuilder<EditorMessage>,
  entry: LutCatalogEntry,
  src: string,
  current: boolean,
  onPick: () => EditorMessage,
) =>
  h.button(
    [
      h.OnClick(onPick()),
      h.OnMouseEnter(PreviewedLut({ lutId: entry.lut_file })),
      h.OnMouseLeave(PreviewedLut({ lutId: null })),
      h.AriaLabel(`Apply ${entry.name}`),
      h.Title(entry.name),
      h.Class(
        `size-24 shrink-0 overflow-hidden border-2 border-bg ${current ? 'border-accent' : 'border-border'}`,
      ),
    ],
    [h.img([h.Src(src), h.Alt(entry.name), h.Loading('lazy'), h.Class('size-full object-cover')])],
  )
