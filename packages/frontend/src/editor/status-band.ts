import { type Html, type HtmlBuilder } from 'foldkit/html'
import { Columns2, Eye, EyeOff, SquareSplitHorizontal } from 'lucide'
import type { IconNode } from 'lucide'
import { icon } from '../components/icon'
import { EditorMessage } from './message'
import type { CompareMode } from './message'
import type { Model } from './model'

/**
 * The status band under the chain dock (docs/adr/0013-materials): the two
 * readouts that used to be canvas overlays. The histogram sits on the left,
 * the zoom and compare controls on the right, both on the same baseline as
 * the dock above them.
 *
 * The histogram is the graded frame's luminance — the same bins the shader
 * path writes, normalized to the tallest bin.
 */
export type StatusBandSlice = Pick<Model, 'bins' | 'scale' | 'compareMode' | 'phase'>

const HISTOGRAM_WIDTH = 208
const HISTOGRAM_HEIGHT = 26

const histogram = (bins: Uint32Array | null, h: HtmlBuilder<EditorMessage>): Html => {
  let max = 0
  if (bins !== null) {
    for (let i = 0; i < 256; i++) {
      const value = bins[i] ?? 0
      if (value > max) {
        max = value
      }
    }
  }
  const curve: string[] = []
  if (bins !== null) {
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * HISTOGRAM_WIDTH
      const y =
        max === 0 ? HISTOGRAM_HEIGHT : HISTOGRAM_HEIGHT - ((bins[i] ?? 0) / max) * HISTOGRAM_HEIGHT
      curve.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
  }
  const area =
    bins === null
      ? ''
      : [...curve, `${HISTOGRAM_WIDTH},${HISTOGRAM_HEIGHT}`, `0,${HISTOGRAM_HEIGHT}`].join(' ')

  return h.svg(
    [
      h.Class('block h-[26px] w-full'),
      h.Attribute('viewBox', `0 0 ${HISTOGRAM_WIDTH} ${HISTOGRAM_HEIGHT}`),
      h.Attribute('preserveAspectRatio', 'none'),
      h.Attribute('aria-hidden', 'true'),
    ],
    [
      ...(bins === null
        ? []
        : [
            h.polygon(
              [
                h.Attribute('points', area),
                h.Attribute('fill', 'var(--mat-hist-top)'),
                h.Attribute('fill-opacity', '0.5'),
              ],
              [],
            ),
            h.polyline(
              [
                h.Attribute('points', curve.join(' ')),
                h.Attribute('fill', 'none'),
                h.Attribute('stroke', 'var(--mat-hist-line)'),
                h.Attribute('stroke-width', '1.25'),
              ],
              [],
            ),
          ]),
    ],
  )
}

const COMPARE_MODES: readonly {
  readonly mode: CompareMode
  readonly label: string
  readonly icon: IconNode
}[] = [
  { icon: EyeOff, label: 'Off', mode: 'off' },
  { icon: Eye, label: 'Toggle', mode: 'toggle' },
  { icon: Columns2, label: 'Split', mode: 'split' },
  { icon: SquareSplitHorizontal, label: 'Side by side', mode: 'side-by-side' },
]

const compareButton = (
  h: HtmlBuilder<EditorMessage>,
  mode: CompareMode,
  label: string,
  Icon: IconNode,
  active: boolean,
  hasImage: boolean,
): Html =>
  h.button(
    [
      h.Class(
        `grid size-10 place-items-center rounded-full transition-colors ${
          active
            ? 'bg-accent text-accent-ink shadow-[0_4px_12px_var(--mat-halo)]'
            : hasImage
              ? 'text-dim hover:bg-s2 hover:text-ink'
              : 'text-dim opacity-30'
        }`,
      ),
      h.OnClick(EditorMessage.ChangedCompareMode({ mode })),
      ...(hasImage ? [] : [h.Disabled(true)]),
      h.AriaLabel(label),
      h.AriaPressed(String(active)),
      h.Title(label),
      h.Key(mode),
    ],
    [icon(h, Icon, label, 14)],
  )

export const statusBand = (h: HtmlBuilder<EditorMessage>, slice: StatusBandSlice): Html => {
  const hasImage = slice.phase._tag === 'Idle' || slice.phase._tag === 'Selected'
  return h.div(
    [h.Class('flex flex-none items-end justify-between gap-6')],
    [
      h.div(
        [h.Class('surface flex h-16 w-[240px] flex-col gap-1 px-4 py-3 max-lg:hidden')],
        [h.span([h.Class('micro')], ['Luma · graded']), histogram(slice.bins, h)],
      ),
      h.div(
        [
          h.Class(
            'surface flex h-12 items-center gap-0.5 p-1 max-lg:w-full max-lg:justify-between',
          ),
        ],
        [
          h.span(
            [h.Class('tnum grid h-10 w-16 place-items-center font-mono text-[10px] text-muted')],
            [`${String(Math.round(slice.scale * 100))}%`],
          ),
          ...COMPARE_MODES.map(({ mode, label, icon: Icon }) =>
            compareButton(h, mode, label, Icon, slice.compareMode === mode, hasImage),
          ),
        ],
      ),
    ],
  )
}
