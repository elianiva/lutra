import { type Html, type HtmlBuilder } from 'foldkit/html'
import { CompareOff, ComparePeek, CompareSide, CompareWipe } from '../components/icons'
import { icon, type IconNode } from '../components/icon'
import { EditorMessage } from './message'
import type { CompareMode } from './message'
import type { Model } from './model'

/**
 * The print's own bar (docs/adr/0013-materials): the luma readout, the zoom
 * level and the compare presentation. Everything here belongs to the
 * frame — it reads or changes what the frame shows — so it is drawn inside
 * the print card and travels with the print when the stage pans or zooms.
 */
export type ViewBarSlice = Pick<Model, 'scale' | 'compareMode' | 'phase' | 'bins'>

const COMPARE_MODES: readonly {
  readonly mode: CompareMode
  readonly label: string
  readonly icon: IconNode
}[] = [
  { icon: CompareOff, label: 'Off', mode: 'off' },
  { icon: ComparePeek, label: 'Toggle', mode: 'toggle' },
  { icon: CompareWipe, label: 'Split', mode: 'split' },
  { icon: CompareSide, label: 'Side by side', mode: 'side-by-side' },
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
        `grid size-7 place-items-center rounded-full transition-colors ${
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
    [icon(h, Icon, label, 12)],
  )

/* ---------- the luma readout: a graph on the frame ---------- */

const LUMA_WIDTH = 132
const LUMA_HEIGHT = 18

/** The graded luma histogram: 256 bins flattened into the readout's width. */
const lumaCurve = (bins: Uint32Array | null, h: HtmlBuilder<EditorMessage>): Html => {
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
      const x = (i / 255) * LUMA_WIDTH
      const y = max === 0 ? LUMA_HEIGHT : LUMA_HEIGHT - ((bins[i] ?? 0) / max) * LUMA_HEIGHT
      curve.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
  }
  const area =
    bins === null ? '' : [...curve, `${LUMA_WIDTH},${LUMA_HEIGHT}`, `0,${LUMA_HEIGHT}`].join(' ')

  return h.svg(
    [
      h.Class('block h-full w-full'),
      h.Attribute('viewBox', `0 0 ${LUMA_WIDTH} ${LUMA_HEIGHT}`),
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

const lumaReadout = (h: HtmlBuilder<EditorMessage>, bins: Model['bins']): Html =>
  h.div(
    [h.Class('flex min-w-0 flex-1 items-center gap-2.5')],
    [
      h.span([h.Class('micro flex-none')], ['Luma']),
      h.div(
        [h.Class('relative h-[18px] min-w-0 flex-1 max-w-[168px]')],
        [lumaCurve(bins, h), h.div([h.Class('seam absolute inset-x-0 bottom-0')], [])],
      ),
    ],
  )

export const viewBar = (h: HtmlBuilder<EditorMessage>, slice: ViewBarSlice): Html => {
  const hasImage =
    slice.phase._tag === 'Idle' ||
    slice.phase._tag === 'Selected' ||
    slice.phase._tag === 'Drafting'
  return h.div(
    [h.Class('mt-3 flex items-center justify-between gap-4')],
    [
      lumaReadout(h, slice.bins),
      h.div(
        [h.Class('flex flex-none items-center gap-2')],
        [
          h.span([h.Class('micro tnum font-mono')], [`${String(Math.round(slice.scale * 100))}%`]),
          h.div(
            [h.Class('flex items-center gap-0.5'), h.AriaLabel('Compare modes')],
            COMPARE_MODES.map(({ mode, label, icon: Icon }) =>
              compareButton(h, mode, label, Icon, slice.compareMode === mode, hasImage),
            ),
          ),
        ],
      ),
    ],
  )
}
