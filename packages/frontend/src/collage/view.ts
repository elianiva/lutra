import { Option } from "effect";
import { Submodel, AsyncData } from "foldkit";
import {
  type Html,
  type Attribute,
  type HtmlBuilder,
  createLazy,
  createKeyedLazy,
} from "foldkit/html";
import { DragAndDrop } from "@foldkit/ui";
import { Download, RotateCcw, X } from "lucide";
import {
  BackRequested,
  ChangedColumns,
  ChangedFrameRatio,
  ChangedGutter,
  ChangedRows,
  ExportRequested,
  GotCollageExportDialogMessage,
  GotDragMessage,
  ModeChanged,
  PanStarted,
  RemovedTile,
  ResetFraming,
  ToggledBackground,
  UndoPressed,
} from "./message";
import type { CollageMessage } from "./message";
import type { Model } from "./model";
import type { Collage, EditId, TileFraming } from "@lutra/store";
import { photoUrl } from "../photo-url";
import { icon } from "../components/icon";
import { cellSize, effectiveRowCount } from "./compose";
import { placement } from "./framing";
import * as ExportDialog from "../export-dialog";

/**
 * The Collage Submodel's view (docs/adr/0009, 0030, 0033, 0035): the
 * fixed-grid preview — each tile drawn from its referenced Edit's
 * full-resolution source through its tile framing, with frame-ratio /
 * columns / rows / gutter / background controls (an explicit M×N grid whose
 * spare capacity renders as background), an Arrange/Frame mode toggle (drag-and-drop reorder
 * vs pan/zoom framing), per-tile remove (Arrange) and reset-framing (Frame),
 * an undo toast, and back navigation. Stepper controls emit raw intents;
 * clamping happens once, in update.
 */

/** The share-target presets (docs/adr/0033); custom W:H covers the rest. */
const FRAME_PRESETS: readonly { label: string; value: number }[] = [
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
];

const matchesPreset = (ratio: number, value: number) =>
  Math.abs(ratio - value) < 1e-9;

// ---- lazy islands (ADR 0034) ----
const lazyControls = createLazy();
const lazyGrid = createLazy();
const lazyCell = createKeyedLazy();
const lazyUndo = createLazy();
const lazyGhost = createLazy();
const lazyHeader = createLazy();
const lazyNoticeBar = createLazy();

const headerView = (h: HtmlBuilder<CollageMessage>): Html => header(h);
const noticeView = (
  notice: string | null,
  h: HtmlBuilder<CollageMessage>,
): Html =>
  notice === null
    ? null
    : h.div(
        [
          h.Class(
            "border-b border-border bg-panel px-4 py-1 text-xs text-accent",
          ),
        ],
        [notice],
      );

export const view = Submodel.defineView<Model, CollageMessage>((model, h) => {
  return h.div(
    [h.Class("relative flex h-full flex-col bg-bg text-ink")],
    [
      lazyHeader(headerView, [h])!,
      lazyNoticeBar(noticeView, [model.notice, h]),
      h.main(
        [h.Class("flex min-h-0 flex-1 flex-col overflow-auto")],
        [body(h, model)],
      ),
      lazyUndo(undoToastView, [model.undo, model.undoLabel, h]),
      lazyGhost(ghostView, [model.photos, model.drag, h]),
      ExportDialog.exportDialogView(h, model.exportDialog, (message) =>
        GotCollageExportDialogMessage({ message }),
      ),
    ],
  );
});

const header = (h: HtmlBuilder<CollageMessage>) =>
  h.header(
    [
      h.Class(
        "flex items-center justify-between border-b border-border bg-panel px-4 py-2",
      ),
    ],
    [
      h.div(
        [h.Class("flex items-center gap-3")],
        [
          h.button(
            [
              h.OnClick(BackRequested()),
              h.AriaLabel("Back to the main menu"),
              h.Class("px-2 text-xs text-muted hover:text-ink"),
            ],
            ["← Menu"],
          ),
          h.h1(
            [h.Class("text-sm font-semibold tracking-[0.3em] text-accent")],
            ["COLLAGE"],
          ),
        ],
      ),
      h.button(
        [
          h.OnClick(ExportRequested()),
          h.AriaLabel("Export this collage"),
          // Icon-only, like the editor's top bar — the dialog's Export
          // button stays the only visible 'Export' text on the screen.
          h.Class("grid size-8 place-items-center text-muted hover:text-ink"),
        ],
        [icon(h, Download, "Export this collage")],
      ),
    ],
  );

const notice = (message: string | null, h: HtmlBuilder<CollageMessage>) =>
  message === null
    ? null
    : h.div(
        [
          h.Class(
            "border-b border-border bg-panel px-4 py-1 text-xs text-accent",
          ),
        ],
        [message],
      );

const undoToastView = (
  undo: Model["undo"],
  undoLabel: Model["undoLabel"],
  h: HtmlBuilder<CollageMessage>,
): Html => {
  if (undo === null || undoLabel === null) return null;
  return h.div(
    [
      h.DataAttribute("undo-toast", "true"),
      h.Class(
        "absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded border border-border bg-panel px-3 py-1.5 text-xs shadow-lg",
      ),
    ],
    [
      h.span([h.Class("text-muted")], [undoLabel]),
      h.button(
        [
          h.OnClick(UndoPressed()),
          h.AriaLabel(`Undo: ${undoLabel.toLowerCase()}`),
          h.DataAttribute("undo-button", "true"),
          h.Class("rounded bg-accent px-2 py-0.5 text-ink hover:opacity-80"),
        ],
        ["Undo"],
      ),
    ],
  );
};

const ghostView = (
  photos: Model["photos"],
  drag: Model["drag"],
  h: HtmlBuilder<CollageMessage>,
): Html => {
  const photoById = new Map(photos.map((p) => [p.id, p]));
  return Option.match(DragAndDrop.ghostStyle(drag), {
    onNone: () => null,
    onSome: (style) => {
      const dragged = Option.match(DragAndDrop.maybeDraggedItemId(drag), {
        onNone: () => null,
        // SAFETY: EditId brand is string at runtime; DragAndDrop stores it as string
        onSome: (id) => photoById.get(id as unknown as EditId) ?? null,
      });
      const draggedUrl = dragged && photoUrl(dragged.id, dragged.source);
      if (!dragged || !draggedUrl) return null;
      return h.div(
        [
          h.Style(style),
          h.Class(
            "-translate-x-1/2 -translate-y-1/2 overflow-hidden rounded border border-accent",
          ),
        ],
        [
          h.div(
            [h.Class("h-20 w-20")],
            [
              h.img([
                h.Src(draggedUrl),
                h.Alt(""),
                h.Class("h-full w-full object-cover"),
              ]),
            ],
          ),
        ],
      );
    },
  });
};

// ---- undo toast ----

const undoToast = (h: HtmlBuilder<CollageMessage>, model: Model) => {
  const { undo, undoLabel } = model;
  if (undo === null || undoLabel === null) {
    return null;
  }
  return h.div(
    [
      h.DataAttribute("undo-toast", "true"),
      h.Class(
        "absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded border border-border bg-panel px-3 py-1.5 text-xs shadow-lg",
      ),
    ],
    [
      h.span([h.Class("text-muted")], [undoLabel]),
      h.button(
        [
          h.OnClick(UndoPressed()),
          h.AriaLabel(`Undo: ${undoLabel.toLowerCase()}`),
          h.DataAttribute("undo-button", "true"),
          h.Class("rounded bg-accent px-2 py-0.5 text-ink hover:opacity-80"),
        ],
        ["Undo"],
      ),
    ],
  );
};

// (ghost superseded by ghostView)

// ---- body ----

const controlsWrapper = (
  mode: Model["mode"],
  collage: Collage,
  h: HtmlBuilder<CollageMessage>,
): Html => {
  // SAFETY: narrow slice for lazy memoization — only fields the view island reads
  const m = { mode } as unknown as Model;
  return controls(h, m, collage);
};

const body = (h: HtmlBuilder<CollageMessage>, model: Model) =>
  AsyncData.match(model.collage, {
    onFailure: (error) => failureState(h, error.message),
    onIdle: () => spinner(h),
    onLoading: () => spinner(h),
    onRefreshing: () => spinner(h),
    onStale: () => spinner(h),
    onSuccess: (collage) =>
      collage.tiles.length === 0
        ? emptyState(h, model.userEmptied)
        : h.div(
            [h.Class("flex min-h-0 flex-1 flex-col gap-4 p-4")],
            [
              lazyControls(controlsWrapper, [model.mode, collage, h])!,
              grid(h, model, collage),
            ],
          ),
  });

const spinner = (h: HtmlBuilder<CollageMessage>) =>
  h.div(
    [h.Class("flex flex-1 items-center justify-center text-sm text-muted")],
    ["Loading…"],
  );

const failureState = (h: HtmlBuilder<CollageMessage>, message: string) =>
  h.div(
    [
      h.Class(
        "flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted",
      ),
    ],
    [h.p([], [`Could not open this collage: ${message}`])],
  );

const emptyState = (h: HtmlBuilder<CollageMessage>, emptiedByUser: boolean) =>
  h.div(
    [
      h.Class(
        "flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted",
      ),
    ],
    [
      h.p(
        [],
        [
          emptiedByUser
            ? "All photos removed."
            : "Every photo in this collage is gone.",
        ],
      ),
      h.p(
        [h.Class("text-xs")],
        [
          emptiedByUser
            ? "Bring them back with Undo, or delete the collage from the menu."
            : "Their edits were deleted.",
        ],
      ),
    ],
  );

// ---- layout controls ----

const stepperButton = (
  h: HtmlBuilder<CollageMessage>,
  label: string,
  ariaLabel: string,
  onClick: CollageMessage,
) =>
  h.button(
    [
      h.OnClick(onClick),
      h.AriaLabel(ariaLabel),
      h.DataAttribute("layout-control", label),
      h.Class(
        "grid size-6 place-items-center rounded border border-border text-xs text-muted hover:border-muted hover:text-ink",
      ),
    ],
    [label],
  );

const controlLabel = (h: HtmlBuilder<CollageMessage>, text: string) =>
  h.span([h.Class("text-[10px] uppercase tracking-[0.14em]")], [text]);

/** The ratio's normalized W:H pair — the shorter side is 1. */
const ratioPair = (ratio: number): [number, number] =>
  ratio >= 1
    ? [Math.round(ratio * 100) / 100, 1]
    : [1, Math.round((1 / ratio) * 100) / 100];

const frameRatioControl = (
  h: HtmlBuilder<CollageMessage>,
  collage: Collage,
) => {
  const ratio = collage.layout.frameRatio;
  const [w, hh] = ratioPair(ratio);
  return h.div(
    [
      h.Class("flex items-center gap-2"),
      h.DataAttribute("control", "frame-ratio"),
    ],
    [
      controlLabel(h, "Frame"),
      h.div(
        [h.Class("flex border border-border")],
        FRAME_PRESETS.map(({ label, value }, i) =>
          h.button(
            [
              h.OnClick(ChangedFrameRatio({ frameRatio: value })),
              h.AriaLabel(`Frame ratio ${label}`),
              h.DataAttribute("frame-preset", label),
              h.AriaPressed(String(matchesPreset(ratio, value))),
              h.Class(
                `px-2 py-0.5 text-xs ${i < FRAME_PRESETS.length - 1 ? "border-r border-border" : ""} ${
                  matchesPreset(ratio, value)
                    ? "bg-accent text-ink"
                    : "text-muted hover:text-ink"
                }`,
              ),
            ],
            [label],
          ),
        ),
      ),
      h.div(
        [
          h.Class("flex items-center gap-1"),
          h.DataAttribute("custom-frame-ratio", "true"),
        ],
        [
          ratioInput(
            h,
            w,
            "frame-ratio-w",
            (value) => value / Math.max(0.01, hh),
          ),
          h.span([], [":"]),
          ratioInput(
            h,
            hh,
            "frame-ratio-h",
            (value) => Math.max(0.01, w) / Math.max(0.01, value),
          ),
        ],
      ),
    ],
  );
};

const ratioInput = (
  h: HtmlBuilder<CollageMessage>,
  value: number,
  testId: string,
  toRatio: (value: number) => number,
) =>
  h.input([
    h.Type("number"),
    h.AriaLabel(
      `Custom frame ratio ${testId.endsWith("w") ? "width" : "height"}`,
    ),
    h.DataAttribute(testId, "true"),
    h.Step("0.1"),
    h.Min("0.1"),
    h.Class(
      "w-12 rounded border border-border bg-transparent px-1 py-0.5 text-center text-xs tnum text-ink",
    ),
    h.Value(String(value)),
    h.OnInput((raw) => {
      const parsed = Number(raw);
      return ChangedFrameRatio({
        frameRatio:
          Number.isFinite(parsed) && parsed > 0 ? toRatio(parsed) : value,
      });
    }),
  ]);

const modeToggle = (h: HtmlBuilder<CollageMessage>, model: Model) =>
  h.div(
    [h.Class("flex border border-border"), h.DataAttribute("control", "mode")],
    (["arrange", "frame"] as const).map((mode, i) =>
      h.button(
        [
          h.OnClick(ModeChanged({ mode })),
          h.AriaLabel(mode === "arrange" ? "Arrange photos" : "Frame photos"),
          h.DataAttribute("mode-button", mode),
          h.AriaPressed(String(model.mode === mode)),
          h.Class(
            `px-2 py-0.5 text-xs capitalize ${i === 0 ? "border-r border-border" : ""} ${
              model.mode === mode
                ? "bg-accent text-ink"
                : "text-muted hover:text-ink"
            }`,
          ),
        ],
        [mode],
      ),
    ),
  );

const controls = (
  h: HtmlBuilder<CollageMessage>,
  model: Model,
  collage: Collage,
) =>
  h.div(
    [
      h.Class(
        "flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted",
      ),
    ],
    [
      frameRatioControl(h, collage),
      h.div(
        [
          h.Class("flex items-center gap-2"),
          h.DataAttribute("control", "columns"),
        ],
        [
          controlLabel(h, "Columns"),
          stepperButton(
            h,
            "−",
            "One fewer column",
            ChangedColumns({ columns: Math.round(collage.layout.columns) - 1 }),
          ),
          h.span(
            [h.Class("tnum text-ink")],
            [String(Math.round(collage.layout.columns))],
          ),
          stepperButton(
            h,
            "+",
            "One more column",
            ChangedColumns({ columns: Math.round(collage.layout.columns) + 1 }),
          ),
        ],
      ),
      h.div(
        [
          h.Class("flex items-center gap-2"),
          h.DataAttribute("control", "rows"),
        ],
        [
          controlLabel(h, "Rows"),
          stepperButton(
            h,
            "−",
            "One fewer row",
            ChangedRows({
              rows: Math.max(1, Math.round(collage.layout.rows)) - 1,
            }),
          ),
          h.span(
            [h.Class("tnum text-ink")],
            [String(Math.max(1, Math.round(collage.layout.rows)))],
          ),
          stepperButton(
            h,
            "+",
            "One more row",
            ChangedRows({
              rows: Math.max(1, Math.round(collage.layout.rows)) + 1,
            }),
          ),
        ],
      ),
      h.div(
        [
          h.Class("flex items-center gap-2"),
          h.DataAttribute("control", "gutter"),
        ],
        [
          controlLabel(h, "Gutter"),
          stepperButton(
            h,
            "−",
            "Smaller gutter",
            ChangedGutter({ gutter: Math.round(collage.layout.gutter) - 8 }),
          ),
          h.span(
            [h.Class("tnum text-ink")],
            [`${Math.round(collage.layout.gutter)}px`],
          ),
          stepperButton(
            h,
            "+",
            "Larger gutter",
            ChangedGutter({ gutter: Math.round(collage.layout.gutter) + 8 }),
          ),
        ],
      ),
      h.button(
        [
          h.OnClick(ToggledBackground()),
          h.AriaLabel("Switch the background between dark and light"),
          h.DataAttribute("control", "background"),
          h.Class(
            "rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-muted hover:text-ink",
          ),
        ],
        [`Background: ${collage.layout.background}`],
      ),
      modeToggle(h, model),
    ],
  );

const gridView = (
  columns: number,
  rows: number,
  gutter: number,
  cellAspect: number,
  background: string,
  tiles: Collage["tiles"],
  framingDraft: Model["framingDraft"],
  mode: Model["mode"],
  drag: Model["drag"],
  photos: Model["photos"],
  sizes: Model["sizes"],
  h: HtmlBuilder<CollageMessage>,
): Html => {
  // Maps for O(1) lookups during per-tile render — avoids linear find per tile
  // on every rAF-throttled PanMoved. Created once per grid render, not per cell.
  const photoById = new Map(photos.map((p) => [p.id, p]));
  const sizeById = new Map(sizes.map((s) => [s.editId as string, s]));
  // An explicit M×N grid renders its spare capacity as background cells
  // (docs/adr/0035) — non-interactive placeholders past the last tile.
  const capacity = columns * rows;
  const empties = Array.from(
    { length: Math.max(0, capacity - tiles.length) },
    (_, i) =>
      h.div(
        [
          h.Key(`empty-${i}`),
          h.DataAttribute("collage-empty-cell", `${i}`),
          h.Style({ aspectRatio: String(cellAspect) }),
        ],
        [],
      ),
  );
  return h.div(
    [
      h.DataAttribute("collage-grid", `${columns}x${rows}`),
      h.Style({
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${gutter}px`,
        padding: `${gutter}px`,
      }),
      h.Class(
        `overflow-hidden mx-auto max-h-[48rem] max-w-[40rem] w-full ${background}`,
      ),
    ],
    [
      ...tiles.map((tile, index) =>
        lazyCell(tile.editId, tileCellView, [
          tile.editId,
          index,
          framingDraft?.index === index ? framingDraft.framing : tile.framing,
          cellAspect,
          mode,
          drag,
          photoById,
          sizeById,
          h,
        ])!,
      ),
      ...empties,
    ],
  );
};

const tileCellView = (
  editId: EditId,
  index: number,
  framing: TileFraming,
  cellAspect: number,
  mode: Model["mode"],
  drag: Model["drag"],
  photoById: Map<string, Model["photos"][number]>,
  sizeById: Map<string, Model["sizes"][number]>,
  h: HtmlBuilder<CollageMessage>,
): Html => {
  // SAFETY: EditId brand is string at runtime
  const photo = (photoById as Map<string, Model["photos"][number]>).get(
    editId as string,
  );
  const url = photo === undefined ? null : photoUrl(photo.id, photo.source);
  const arrange = mode === "arrange";
  const dropTarget = Option.match(DragAndDrop.maybeDropTarget(drag), {
    onNone: () => null,
    onSome: (t) => (t.containerId === `tile-${index}` ? t : null),
  });
  const draggedHere =
    DragAndDrop.isDragging(drag) &&
    Option.match(DragAndDrop.maybeDraggedItemId(drag), {
      onNone: () => false,
      onSome: (id) => id === editId,
    });
  const cellClass = [
    "relative overflow-hidden",
    ...(dropTarget !== null ? ["ring-2 ring-accent"] : []),
    ...(draggedHere ? ["opacity-40"] : []),
    ...(!arrange ? ["cursor-grab select-none touch-none"] : []),
  ].join(" ");
  const cellAttrs: Attribute<CollageMessage>[] = [
    h.Key(editId),
    h.DataAttribute("collage-cell", `${index}`),
    h.DataAttribute("collage-tile", `${index}`),
    h.Style(
      arrange
        ? { aspectRatio: String(cellAspect) }
        : { aspectRatio: String(cellAspect), touchAction: "none" },
    ),
    ...DragAndDrop.droppable(`tile-${index}`, `Photo slot ${index + 1}`),
    h.Class(cellClass),
  ];
  if (!arrange) {
    cellAttrs.push(
      h.OnPointerDown((_pointerType, button, screenX, screenY) =>
        button === 0
          ? Option.some(PanStarted({ index, screenX, screenY }))
          : Option.none(),
      ),
      // No OnDoubleClick(ResetFraming) here: browsers synthesize click/dblclick
      // from down+up on the same element even after a long drag, so ending one
      // pan and quickly re-grabbing fired a spurious reset — the photo appeared
      // to snap back to center (docs/adr/0019 chose button-only reset for the
      // same reason). The tile's reset button covers the affordance.
    );
  }
  return h.div(cellAttrs, [
    h.div(
      [
        ...(arrange
          ? [
              ...DragAndDrop.draggable(
                {
                  model: drag,
                  toParentMessage: (message) => GotDragMessage({ message }),
                  itemId: editId,
                  containerId: `tile-${index}`,
                  index,
                },
                h,
              ),
              ...DragAndDrop.sortable(editId),
            ]
          : []),
        h.Class("relative h-full w-full"),
      ],
      [
        url === null || photo === undefined
          ? h.div(
              [
                h.Class(
                  "flex h-full w-full items-center justify-center text-xs text-muted",
                ),
              ],
              ["No photo"],
            )
          : framedPhotoCached(h, url, editId, framing, cellAspect, sizeById),
        arrange
          ? h.button(
              [
                h.OnClick(RemovedTile({ index })),
                h.AriaLabel(`Remove photo ${index + 1}`),
                h.DataAttribute("remove-tile", `${index}`),
                h.Class(
                  "absolute right-0 top-0 z-10 grid size-7 place-items-center bg-black/50 text-[10px] text-white/80 hover:text-white",
                ),
              ],
              [icon(h, X, `Remove photo ${index + 1}`, 12)],
            )
          : h.button(
              [
                h.OnClick(ResetFraming({ index })),
                h.AriaLabel(`Reset framing of photo ${index + 1}`),
                h.DataAttribute("reset-framing", `${index}`),
                h.Class(
                  "absolute right-0 top-0 z-10 grid size-7 place-items-center bg-black/50 text-white/80 hover:text-white",
                ),
              ],
              [icon(h, RotateCcw, `Reset framing of photo ${index + 1}`, 12)],
            ),
        dropTarget !== null
          ? h.div(
              [
                h.DataAttribute("drop-indicator", `${dropTarget.index}`),
                h.Class(
                  `absolute z-10 w-1 bg-accent ${dropTarget.index === 0 ? "left-0 top-0 h-full" : "bottom-0 right-0 h-full"}`,
                ),
              ],
              [],
            )
          : null,
      ],
    ),
  ]);
};

const framedPhotoCached = (
  h: HtmlBuilder<CollageMessage>,
  url: string,
  editId: EditId,
  framing: TileFraming,
  cellAspect: number,
  sizeById: Map<string, Model["sizes"][number]>,
): Html => {
  const size = sizeById.get(editId as string);
  const imageAspect =
    !size || size.width <= 0 || size.height <= 0
      ? null
      : size.width / size.height;
  if (imageAspect === null)
    return h.img([
      h.Src(url),
      h.Alt(""),
      h.Attribute("decoding", "async"),
      h.Attribute("draggable", "false"),
      h.Class("h-full w-full object-cover"),
    ]);
  const p = placement(framing, imageAspect, cellAspect);
  return h.img([
    h.Src(url),
    h.Alt(""),
    h.Attribute("decoding", "async"),
    h.Attribute("draggable", "false"),
    h.Class("absolute max-w-none select-none pointer-events-none"),
    h.Style({
      width: `${p.width * 100}%`,
      height: `${p.height * 100}%`,
      left: `${p.left * 100}%`,
      top: `${p.top * 100}%`,
      // Promote to compositor layer; hint the browser that these properties
      // animate on every rAF during a pan drag. `contain: strict` isolates
      // layout so a single tile's transform doesn't invalidate siblings.
      willChange: "left, top, width, height",
      transform: "translateZ(0)",
      contain: "strict",
    }),
  ]);
};

const grid = (
  h: HtmlBuilder<CollageMessage>,
  model: Model,
  collage: Collage,
) => {
  const layout = collage.layout;
  const columns = Math.max(1, Math.round(layout.columns));
  const rows = effectiveRowCount(layout, collage.tiles.length);
  const gutter = Math.round(layout.gutter);
  const cell = cellSize(layout, collage.tiles.length, 1000);
  const cellAspect = cell.width / cell.height;
  const background = layout.background === "dark" ? "bg-black" : "bg-white";
  return lazyGrid(gridView, [
    columns,
    rows,
    gutter,
    cellAspect,
    background,
    collage.tiles,
    model.framingDraft,
    model.mode,
    model.drag,
    model.photos,
    model.sizes,
    h,
  ])!;
};
