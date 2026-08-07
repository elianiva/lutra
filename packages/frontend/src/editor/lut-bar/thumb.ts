import type { HtmlBuilder } from 'foldkit/html'
import type { EditorMessage } from '../message'
import { PreviewedLut } from '../message'
import type { LutCatalogEntry } from '../../luts/store'

export const thumb = (
  h: HtmlBuilder<EditorMessage>,
  entry: LutCatalogEntry,
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
    [
      h.img([
        h.Src(`/luts/${entry.thumbnail}`),
        h.Alt(entry.name),
        h.Loading('lazy'),
        h.Class('size-full object-cover'),
      ]),
    ],
  )
