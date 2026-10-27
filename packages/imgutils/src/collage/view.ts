import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { ArrowLeft, ArrowRight, Plus, RotateCcw, Shuffle, X } from 'lucide'
import { icon } from '@/components/icon'
import { field, group, label, numberInput, pillButton, segmented } from '@/components/controls'
import { rangeRow } from '@/components/range-row'
import { cn } from '@/lib/utils'
import { COLLAGE_RATIOS, borderWidth, frameSize, ratioValue } from '../geometry'
import { Message } from '../message'
import type { Collage, Model, Slot } from '../model'
import type { Settings } from '../settings'
import { resolveTemplate } from '../update'
import { GRID_MAX, PRESETS, clampGap, coverSourceRect, layoutCells } from './layout'
import type { Preset, Rect, Template } from './layout'

/**
 * Collage mode: the live preview on the left, the canvas, layout, photo and
 * export controls on the right. The preview is plain DOM — each photo is an
 * `<img>` cropped by its cell, positioned from the same cover math the export
 * uses, so what you see is what the worker draws.
 */
export const collageView = (h: HtmlBuilder<Message>, model: Model): Html =>
  h.div(
    [h.Class('flex min-w-0 flex-1 flex-col gap-5 xl:flex-row xl:items-start')],
    [preview(h, model.collage, model.settings), controls(h, model.collage, model.settings)],
  )

/* ---------- preview ---------- */

/** The preview's own unit width. Only ratios reach the DOM, as percentages. */
const UNITS = 1000

const pct = (value: number, of: number) => `${(value / of) * 100}%`

const preview = (h: HtmlBuilder<Message>, collage: Collage, settings: Settings): Html => {
  const template = resolveTemplate(collage)
  const frame = frameSize(UNITS, ratioValue(collage.ratio), settings.borderPercent)
  const border = borderWidth(UNITS, settings.borderPercent)
  const total = { width: frame.width + border * 2, height: frame.height + border * 2 }
  const gap = clampGap(
    template,
    frame.width,
    frame.height,
    Math.round(frame.width * (collage.gapPercent / 100)),
  )
  const rects = layoutCells(template, frame.width, frame.height, gap)
  return h.div(
    [h.Class('well flex min-w-0 flex-1 items-center justify-center p-4 sm:p-8')],
    [
      h.div(
        [
          h.Class('relative touch-none select-none shadow-[var(--mat-elev-2)]'),
          h.Style({
            'aspect-ratio': `${total.width} / ${total.height}`,
            width: `min(100%, calc((100dvh - 200px) * ${total.width / total.height}))`,
            background: settings.borderColor,
          }),
          h.AriaLabel('Collage preview'),
          h.DataAttribute('collage-preview', 'true'),
          h.OnPointerMove((x, y) =>
            collage.pan === null ? Option.none() : Option.some(Message.MovedPointer({ x, y })),
          ),
          h.OnPointerUp(() =>
            collage.pan === null ? Option.none() : Option.some(Message.ReleasedPointer()),
          ),
          h.OnPointerLeave(() =>
            collage.pan === null ? Option.none() : Option.some(Message.ReleasedPointer()),
          ),
        ],
        [
          h.div(
            [
              h.Class('absolute overflow-hidden'),
              h.Style({
                left: pct(border, total.width),
                top: pct(border, total.height),
                width: pct(frame.width, total.width),
                height: pct(frame.height, total.height),
                background: settings.background,
              }),
            ],
            rects.map((rect, index) =>
              cell(h, rect, frame, index, collage.slots[index] ?? null, index === collage.selected),
            ),
          ),
        ],
      ),
    ],
  )
}

const cellSize = (target: EventTarget | null): Option.Option<DOMRect> =>
  target instanceof Element
    ? Option.fromNullishOr(target.closest('[data-cell]')).pipe(
        Option.map((element) => element.getBoundingClientRect()),
      )
    : Option.none()

const cell = (
  h: HtmlBuilder<Message>,
  rect: Rect,
  frame: Readonly<{ width: number; height: number }>,
  index: number,
  slot: Slot | null,
  selected: boolean,
): Html =>
  h.div(
    [
      h.Key(`cell-${index}`),
      h.DataAttribute('cell', String(index)),
      h.Class(cn('absolute overflow-hidden', slot === null ? 'cursor-pointer' : 'cursor-grab')),
      h.Style({
        left: pct(rect.x, frame.width),
        top: pct(rect.y, frame.height),
        width: pct(rect.w, frame.width),
        height: pct(rect.h, frame.height),
      }),
      ...(slot === null
        ? [
            h.OnClick(Message.ReplaceRequested({ index })),
            h.AriaLabel(`Add a photo to cell ${index + 1}`),
          ]
        : [
            h.OnPointerDown((_type, button, screenX, screenY, _time, _x, _y, _id, target) =>
              button === 0
                ? Option.map(cellSize(target), (size) =>
                    Message.PressedCell({
                      index,
                      x: screenX,
                      y: screenY,
                      cellWidth: size.width,
                      cellHeight: size.height,
                    }),
                  )
                : Option.none(),
            ),
          ]),
    ],
    [
      slot === null ? emptyCell(h, index) : photo(h, slot, rect),
      selected
        ? h.div(
            [
              h.Class(
                'pointer-events-none absolute inset-0 shadow-[inset_0_0_0_2px_var(--mat-accent)]',
              ),
            ],
            [],
          )
        : null,
    ],
  )

const photo = (h: HtmlBuilder<Message>, slot: Slot, rect: Rect): Html => {
  const src = coverSourceRect(slot.width, slot.height, rect.w, rect.h, slot.adjust)
  return h.img([
    h.Src(slot.url),
    h.Alt(slot.file.name),
    h.Draggable(false),
    h.Class('pointer-events-none absolute max-w-none'),
    h.Style({
      width: pct(slot.width, src.sw),
      height: pct(slot.height, src.sh),
      left: `-${pct(src.sx, src.sw)}`,
      top: `-${pct(src.sy, src.sh)}`,
    }),
  ])
}

const emptyCell = (h: HtmlBuilder<Message>, index: number): Html =>
  h.div(
    [
      h.Class(
        'absolute inset-[6%] flex flex-col items-center justify-center gap-1 rounded-[10px] bg-black/5 text-black/45 shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]',
      ),
    ],
    [
      h.span([h.Class('font-mono text-sm tnum')], [String(index + 1).padStart(2, '0')]),
      icon(h, Plus, 'Add photo', 14),
    ],
  )

/* ---------- controls ---------- */

const controls = (h: HtmlBuilder<Message>, collage: Collage, settings: Settings): Html => {
  const frame = frameSize(settings.width, ratioValue(collage.ratio), settings.borderPercent)
  const border = borderWidth(settings.width, settings.borderPercent)
  const filled = collage.slots.filter((slot) => slot !== null).length
  return h.div(
    [h.Class('surface flex flex-col gap-6 p-4 xl:w-[340px] xl:flex-none')],
    [
      group(h, 'Canvas', [
        field(h, [
          label(h, 'Aspect ratio', `${frame.width + border * 2} × ${frame.height + border * 2}`),
          segmented(h, {
            ariaLabel: 'Collage aspect ratio',
            columns: 4,
            options: COLLAGE_RATIOS.map((ratio) => ({ label: ratio, value: ratio })),
            selected: collage.ratio,
            onSelect: (ratio) => Message.ChangedRatio({ ratio }),
          }),
        ]),
        rangeRow(h, {
          id: 'gap',
          label: 'Gap',
          display: `${collage.gapPercent}%`,
          min: 0,
          max: 8,
          step: 0.5,
          value: collage.gapPercent,
          onInput: (gapPercent) => Message.ChangedGap({ gapPercent }),
        }),
      ]),
      h.div([h.Class('seam')], []),
      group(h, 'Layout', [
        h.div(
          [h.Class('grid grid-cols-6 gap-1.5'), h.Role('group'), h.AriaLabel('Layouts')],
          PRESETS.map((preset) => presetChip(h, preset, preset.id === collage.presetId)),
        ),
        h.div(
          [h.Class('grid grid-cols-2 gap-3')],
          [
            field(h, [
              h.label([h.For('grid-cols'), h.Class('label')], ['Columns']),
              numberInput(h, {
                id: 'grid-cols',
                value: collage.cols,
                min: 1,
                max: GRID_MAX,
                step: 1,
                onChange: (cols) => Message.ChangedGrid({ rows: collage.rows, cols }),
              }),
            ]),
            field(h, [
              h.label([h.For('grid-rows'), h.Class('label')], ['Rows']),
              numberInput(h, {
                id: 'grid-rows',
                value: collage.rows,
                min: 1,
                max: GRID_MAX,
                step: 1,
                onChange: (rows) => Message.ChangedGrid({ rows, cols: collage.cols }),
              }),
            ]),
          ],
        ),
      ]),
      h.div([h.Class('seam')], []),
      group(h, `Photos · ${filled}/${collage.slots.length}`, [
        h.div(
          [h.Class('flex flex-wrap items-center gap-1')],
          [
            pillButton(h, {
              label: [icon(h, Plus, 'Add', 14), 'Add photos'],
              onClick: Message.CollageAddRequested(),
              primary: true,
            }),
            pillButton(h, {
              label: [icon(h, Shuffle, 'Shuffle', 14), 'Shuffle'],
              onClick: Message.ShuffleRequested(),
              isDisabled: filled < 2,
            }),
            pillButton(h, {
              label: ['Clear'],
              onClick: Message.CollageClearRequested(),
              isDisabled: filled === 0,
            }),
          ],
        ),
        h.ul(
          [h.Class('grid grid-cols-5 gap-1.5'), h.AriaLabel('Cells')],
          collage.slots.map((slot, index) => thumb(h, slot, index, index === collage.selected)),
        ),
      ]),
      h.div([h.Class('seam')], []),
      selectedGroup(h, collage),
      h.div([h.Class('seam')], []),
      h.div(
        [h.Class('flex flex-col gap-2')],
        [
          pillButton(h, {
            label: [collage.saving ? 'Working…' : 'Save collage'],
            onClick: Message.CollageSaveRequested(),
            primary: true,
            isDisabled: collage.saving || filled === 0,
            className: 'h-10',
          }),
          collage.status === ''
            ? null
            : h.p(
                [h.Class('text-center text-[11px] text-muted'), h.Role('status')],
                [collage.status],
              ),
        ],
      ),
    ],
  )
}

/** A template drawn as its own grid, so the chip needs no explanation. */
const mini = (h: HtmlBuilder<Message>, template: Template): Html => {
  const spans =
    template.spans ??
    Array.from(
      { length: template.rows * template.cols },
      (_, index) => [Math.floor(index / template.cols), index % template.cols, 1, 1] as const,
    )
  return h.span(
    [
      h.Class('grid aspect-square w-full gap-[2px]'),
      h.Style({
        'grid-template-rows': `repeat(${template.rows}, 1fr)`,
        'grid-template-columns': `repeat(${template.cols}, 1fr)`,
      }),
      h.AriaHidden(true),
    ],
    spans.map(([row, col, rowSpan, colSpan]) =>
      h.i(
        [
          h.Class('rounded-[2px] bg-current opacity-35'),
          h.Style({ 'grid-area': `${row + 1} / ${col + 1} / span ${rowSpan} / span ${colSpan}` }),
        ],
        [],
      ),
    ),
  )
}

const presetChip = (h: HtmlBuilder<Message>, preset: Preset, active: boolean): Html =>
  h.button(
    [
      h.Type('button'),
      h.Class(
        cn(
          'flex rounded-[8px] p-1.5 transition-colors',
          active
            ? 'bg-accent-soft text-accent shadow-[0_0_0_2px_var(--mat-halo)]'
            : 'bg-well text-dim hover:text-ink',
        ),
      ),
      h.AriaPressed(String(active)),
      h.Title(preset.label),
      h.AriaLabel(preset.label),
      h.OnClick(Message.SelectedPreset({ id: preset.id })),
    ],
    [mini(h, preset)],
  )

const thumb = (
  h: HtmlBuilder<Message>,
  slot: Slot | null,
  index: number,
  selected: boolean,
): Html =>
  h.li(
    [
      h.Key(slot === null ? `empty-${index}` : `slot-${slot.key}`),
      h.Class('relative aspect-square'),
      h.Draggable(slot !== null),
      h.OnDragStart(Message.DragStartedCell({ index })),
      h.AllowDrop(),
      h.OnDrop(Message.DroppedOnCell({ index })),
    ],
    [
      h.button(
        [
          h.Type('button'),
          h.Class(
            cn(
              'size-full overflow-hidden rounded-[10px] bg-well',
              selected ? 'shadow-[0_0_0_2px_var(--mat-accent)]' : '',
            ),
          ),
          h.AriaLabel(
            slot === null ? `Add a photo to cell ${index + 1}` : `Select photo ${index + 1}`,
          ),
          h.AriaPressed(String(selected)),
          h.OnClick(
            slot === null ? Message.ReplaceRequested({ index }) : Message.SelectedCell({ index }),
          ),
        ],
        [
          slot === null
            ? h.span(
                [h.Class('grid size-full place-items-center text-dim')],
                [icon(h, Plus, 'Add', 14)],
              )
            : h.img([
                h.Src(slot.url),
                h.Alt(''),
                h.Draggable(false),
                h.Class('size-full object-cover'),
              ]),
        ],
      ),
      h.span(
        [
          h.Class(
            'pointer-events-none absolute bottom-1 left-1 font-mono text-[9px] tnum text-white mix-blend-difference',
          ),
        ],
        [String(index + 1)],
      ),
      slot === null
        ? null
        : h.button(
            [
              h.Type('button'),
              h.Class(
                'pill absolute -right-1 -top-1 grid size-5 place-items-center text-muted hover:text-accent',
              ),
              h.AriaLabel(`Remove photo ${index + 1}`),
              h.OnClick(Message.RemovedCell({ index })),
            ],
            [icon(h, X, 'Remove', 10)],
          ),
    ],
  )

const selectedGroup = (h: HtmlBuilder<Message>, collage: Collage): Html => {
  const slot = collage.slots[collage.selected] ?? null
  const adjust = slot?.adjust ?? { zoom: 1, fx: 0.5, fy: 0.5 }
  const disabled = slot === null
  return group(h, `Photo ${collage.selected + 1}`, [
    rangeRow(h, {
      id: 'cell-zoom',
      label: 'Zoom',
      display: `${Math.round(adjust.zoom * 100)}%`,
      min: 100,
      max: 300,
      step: 1,
      value: Math.round(adjust.zoom * 100),
      isDisabled: disabled,
      onInput: (zoom) => Message.ChangedZoom({ zoom: zoom / 100 }),
    }),
    rangeRow(h, {
      id: 'cell-fx',
      label: 'Position X',
      display: String(Math.round(adjust.fx * 100)),
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(adjust.fx * 100),
      isDisabled: disabled,
      onInput: (fx) => Message.ChangedFocus({ fx: fx / 100, fy: adjust.fy }),
    }),
    rangeRow(h, {
      id: 'cell-fy',
      label: 'Position Y',
      display: String(Math.round(adjust.fy * 100)),
      min: 0,
      max: 100,
      step: 1,
      value: Math.round(adjust.fy * 100),
      isDisabled: disabled,
      onInput: (fy) => Message.ChangedFocus({ fx: adjust.fx, fy: fy / 100 }),
    }),
    h.div(
      [h.Class('flex items-center gap-1')],
      [
        pillButton(h, {
          label: [icon(h, ArrowLeft, 'Move left', 14)],
          ariaLabel: 'Move photo one cell earlier',
          onClick: Message.MovedSelected({ direction: -1 }),
          isDisabled: disabled || collage.selected === 0,
        }),
        pillButton(h, {
          label: [icon(h, ArrowRight, 'Move right', 14)],
          ariaLabel: 'Move photo one cell later',
          onClick: Message.MovedSelected({ direction: 1 }),
          isDisabled: disabled || collage.selected >= collage.slots.length - 1,
        }),
        pillButton(h, {
          label: [icon(h, RotateCcw, 'Reset', 14), 'Reset'],
          onClick: Message.ResetView(),
          isDisabled: disabled,
          className: 'ml-auto',
        }),
      ],
    ),
  ])
}
