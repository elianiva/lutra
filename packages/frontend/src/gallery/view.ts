import { DateTime } from "effect";
import { Submodel, AsyncData } from "foldkit";
import {
  type Html,
  type HtmlBuilder,
  createLazy,
  createKeyedLazy,
} from "foldkit/html";
import { Check, Undo2, X } from "lucide";
import {
  ClickedEdit,
  CollageDeleteConfirmCancelled,
  CollageDeleteRequested,
  CollageOpenRequested,
  CreateCollageRequested,
  DeleteConfirmRequested,
  OpenPhotoRequested,
  RefreshRequested,
  SettingsRequested,
  ToggledCollageDeleteConfirm,
  ToggledSelection,
} from "./message";
import type { GalleryMessage } from "./message";
import type { Model } from "./model";
import type {
  Collage as CollageRecord,
  EditSummary,
  EditId,
  StoreError,
} from "@lutra/store";
import { settingsDialogView } from "./settings-dialog";
import { deleteDialogView } from "./delete-dialog";

/**
 * The Gallery Submodel's view (docs/adr/0009). Branded via `defineView` so it
 * embeds under the root through `h.submodel`, with `h` typed to the Gallery's
 * own Message union. Renders the grid of Edit summaries ordered by `savedAt`.
 *
 * Thumbnails: `EditSummary.thumbnail` is encoded bytes. A per-summary object
 * URL is created from the bytes and memoized by id. The lifecycle (revoking
 * on unmount / delete) is refined in the editor save-flow slice per the
 * thumbnail contract (docs/adr/0007).
 */
// ---- memoization (ADR 0034) ----
const lazyHeader = createLazy();
const lazyNotice = createLazy();
const lazyTile = createKeyedLazy();
const lazyCollageCard = createKeyedLazy();
const lazyCollageSection = createLazy();

const headerView = (
  selectedCount: number,
  h: HtmlBuilder<GalleryMessage>,
): Html => header(h, selectedCount);
const noticeView = (
  message: string | null,
  h: HtmlBuilder<GalleryMessage>,
): Html => notice(message, h);

export const view = Submodel.defineView<Model, GalleryMessage>((model, h) => {
  const { grid } = model;
  return h.div(
    [h.Class("flex h-full flex-col bg-bg text-ink")],
    [
      lazyHeader(headerView, [model.selection.length, h])!,
      lazyNotice(noticeView, [model.notice, h]) ?? notice(model.notice, h),
      h.main(
        [h.Class("flex min-h-0 flex-1 flex-col overflow-auto")],
        [
          gridBody(h, grid, model.selection),
          lazyCollageSection(collagesSectionView, [
            model.collages,
            model.grid,
            model.collageThumbSizes,
            model.confirmingCollageDelete,
            h,
          ]) ?? collagesSection(h, model),
        ],
      ),
      settingsDialogView(h, model),
      deleteDialogView(h, model),
    ],
  );
});

const collagesSectionView = (
  collages: Model["collages"],
  grid: Model["grid"],
  thumbSizes: Model["collageThumbSizes"],
  confirming: Model["confirmingCollageDelete"],
  h: HtmlBuilder<GalleryMessage>,
): Html => {
  const m = {
    collages,
    grid,
    collageThumbSizes: thumbSizes,
    confirmingCollageDelete: confirming,
    // SAFETY: narrow slice for lazy memoization — only fields the view island reads
  } as unknown as Model;
  return collagesSection(h, m);
};

const notice = (message: string | null, h: HtmlBuilder<GalleryMessage>) =>
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

const header = (h: HtmlBuilder<GalleryMessage>, selectedCount: number) =>
  h.header(
    [
      h.Class(
        "flex items-center justify-between border-b border-border bg-panel px-4 py-2",
      ),
    ],
    [
      h.h1(
        [h.Class("text-sm font-semibold tracking-[0.3em] text-accent")],
        ["LUTRA"],
      ),
      h.div(
        [h.Class("flex items-center gap-2")],
        [
          // "Create collage" appears once two or more edits are selected
          // (docs/adr/0030): below that there is nothing to arrange.
          ...(selectedCount >= 2
            ? [
                h.button(
                  [
                    h.OnClick(CreateCollageRequested()),
                    h.AriaLabel(
                      `Create a collage from ${selectedCount} selected edits`,
                    ),
                    h.DataAttribute("create-collage", "true"),
                    h.Class(
                      "rounded bg-accent px-3 py-1 text-xs text-ink hover:opacity-80",
                    ),
                  ],
                  [`Create collage (${selectedCount})`],
                ),
              ]
            : []),
          h.button(
            [
              h.OnClick(OpenPhotoRequested()),
              h.AriaLabel("Open a photo to start a new edit"),
              h.Class(
                "rounded border border-accent px-3 py-1 text-xs text-accent hover:border-ink hover:text-ink",
              ),
            ],
            ["Open photo"],
          ),
          h.button(
            [
              h.OnClick(RefreshRequested()),
              h.AriaLabel("Refresh"),
              h.Class("px-2 text-xs text-muted hover:text-ink"),
            ],
            ["Refresh"],
          ),
          // Same utility-action styling as "Refresh" — settings is chrome,
          // not a primary CTA like "Open photo".
          h.button(
            [
              h.OnClick(SettingsRequested()),
              h.AriaLabel("Open settings"),
              h.DataAttribute("open-settings", "true"),
              h.Class("px-2 text-xs text-muted hover:text-ink"),
            ],
            ["Settings"],
          ),
        ],
      ),
    ],
  );

const gridBody = (
  h: HtmlBuilder<GalleryMessage>,
  grid: AsyncData.AsyncData<readonly EditSummary[], StoreError>,
  selection: readonly EditId[],
) =>
  AsyncData.match(grid, {
    onFailure: (error) => errorState(h, error.message),
    onIdle: () => spinner(h),
    onLoading: () => spinner(h),
    onRefreshing: () => spinner(h),
    onStale: () => spinner(h),
    onSuccess: (summaries) =>
      summaries.length === 0
        ? emptyState(h)
        : gridTiles(h, summaries, selection),
  });

const spinner = (h: HtmlBuilder<GalleryMessage>) =>
  h.div(
    [h.Class("flex flex-1 items-center justify-center text-sm text-muted")],
    ["Loading…"],
  );

const emptyState = (h: HtmlBuilder<GalleryMessage>) =>
  h.div(
    [
      h.Class(
        "flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted",
      ),
    ],
    [
      h.p([], ["No saved edits yet."]),
      h.button(
        [
          h.OnClick(OpenPhotoRequested()),
          h.AriaLabel("Open a photo to start a new edit"),
          h.Class(
            "rounded bg-accent px-4 py-2 text-xs text-ink hover:opacity-80",
          ),
        ],
        ["Open a photo to start editing"],
      ),
      h.p([h.Class("text-xs text-muted")], ["Your edits will appear here."]),
    ],
  );

const errorState = (h: HtmlBuilder<GalleryMessage>, error: string) =>
  h.div(
    [
      h.Class(
        "flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted",
      ),
    ],
    [
      h.p([], [`Could not load your gallery: ${error}`]),
      h.button(
        [
          h.OnClick(RefreshRequested()),
          h.Class("cursor-pointer text-ink underline underline-offset-2"),
        ],
        ["Try again"],
      ),
    ],
  );

/** Overlay controls (select, delete, caption) stay invisible until the
 *  pointer rests on the card or focus moves into it — instantly, no
 *  transition. Focus uses `:focus-visible` (not plain focus) so a mouse
 *  click that lands on a control doesn't latch the overlays open after the
 *  pointer leaves; tabbing in still reveals them for keyboard users. */
const hoverReveal =
  "opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100";

const gridTiles = (
  h: HtmlBuilder<GalleryMessage>,
  summaries: readonly EditSummary[],
  selection: readonly EditId[],
) =>
  h.div(
    [h.Class("grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 p-4")],
    summaries.map((summary) =>
      lazyTile(summary.id, tileView, [
        summary,
        selection.includes(summary.id),
        h,
      ])!,
    ),
  );

const tileView = (
  summary: EditSummary,
  selected: boolean,
  h: HtmlBuilder<GalleryMessage>,
): Html => tile(h, summary, selected);

const tile = (
  h: HtmlBuilder<GalleryMessage>,
  summary: EditSummary,
  selected: boolean,
) =>
  h.div(
    [
      h.Key(summary.id),
      h.DataAttribute("edit-id", summary.id),
      h.Class(
        `group relative aspect-square overflow-hidden rounded border bg-panel hover:border-muted ${
          selected ? "border-accent" : "border-border"
        }`,
      ),
    ],
    [
      // Click target for opening the edit — must not include the select or
      // delete buttons so those clicks don't bubble up into ClickedEdit.
      h.button(
        [
          h.OnClick(ClickedEdit({ id: summary.id })),
          h.AriaLabel(`Open saved edit`),
          h.Class("absolute inset-0"),
        ],
        [tileThumb(h, summary)],
      ),
      // The collage-select control (docs/adr/0030): an overlay like the
      // delete control — no separate "select mode" to enter or leave; the
      // header CTA appears at two or more. Hidden until hover/focus like
      // the rest of the tile's overlays — except once selected, where it
      // stays put so the picked state remains visible without hover.
      h.button(
        [
          h.OnClick(ToggledSelection({ id: summary.id })),
          h.AriaLabel(
            selected
              ? "Remove from collage selection"
              : "Add to collage selection",
          ),
          h.DataAttribute("select-edit-id", summary.id),
          h.Class(
            `absolute left-1 top-1 z-10 grid size-7 place-items-center rounded-full border ${
              selected
                ? "border-accent bg-accent text-ink"
                : `border-white/60 bg-black/40 text-white/80 hover:text-white ${hoverReveal}`
            }`,
          ),
        ],
        selected ? [icon(h, Check, "Selected")] : [],
      ),
      // Caption + delete ✕: hidden until hover/focus (the ✕ opens the
      // delete-confirmation dialog, ADR-0022 superseded).
      h.div(
        [
          h.Class(
            `absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1 ${hoverReveal}`,
          ),
        ],
        [
          h.span(
            [h.Class("text-[10px] text-white/80")],
            [
              summary.savedAt > 0
                ? DateTime.formatLocal({ dateStyle: "short" })(
                    DateTime.makeUnsafe(summary.savedAt),
                  )
                : "",
            ],
          ),
          h.div(
            [h.Class("flex items-center gap-1")],
            [
              h.button(
                [
                  h.OnClick(DeleteConfirmRequested({ id: summary.id })),
                  h.AriaLabel("Delete saved edit"),
                  // size-7: a finger-sized hit target on touch screens
                  // (docs/adr/0024-mobile-ui).
                  h.Class(
                    "relative z-10 grid size-7 place-items-center text-white/80 hover:text-white",
                  ),
                  h.DataAttribute("delete-edit-id", summary.id),
                ],
                [icon(h, X, "Delete saved edit")],
              ),
            ],
          ),
        ],
      ),
    ],
  );

/** Memoize bytes→object URL per summary id via the shared cache. */
import { thumbnailUrl } from "../thumbnail-url";
import { icon } from "../components/icon";
import { cellSize, effectiveRowCount } from "../collage/compose";
import { isDefaultFraming, placement } from "../collage/framing";
const tileThumb = (h: HtmlBuilder<GalleryMessage>, summary: EditSummary) => {
  const url = thumbnailUrl(summary.id, summary.thumbnail);
  return url
    ? h.img([h.Src(url), h.Alt(""), h.Class("h-full w-full object-cover")])
    : h.div(
        [h.Class("flex h-full w-full items-center justify-center text-muted")],
        ["No thumb"],
      );
};

// ---- Collages section (docs/adr/0030) ----

/**
 * The saved-collages strip beneath the edits grid. Each card composes a live
 * mini-preview client-side: a CSS grid mirroring the collage's layout
 * (columns, rows, gutter, background) filled with the referenced Edits' cached
 * thumbnails — no pixels are copied; the record is the summary. Hidden
 * entirely while the store holds no collages.
 */
const collagesSection = (h: HtmlBuilder<GalleryMessage>, model: Model) =>
  AsyncData.match(model.collages, {
    onFailure: () => null,
    onIdle: () => null,
    onLoading: () => null,
    onRefreshing: () => null,
    onStale: () => null,
    onSuccess: (collages) =>
      collages.length === 0 ? null : collageCards(h, collages, model),
  });

const collageCards = (
  h: HtmlBuilder<GalleryMessage>,
  collages: readonly CollageRecord[],
  model: Model,
) =>
  h.section(
    [
      h.DataAttribute("collages-section", "true"),
      h.Class("border-t border-border p-4"),
    ],
    [
      h.h2(
        [
          h.Class(
            "mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted",
          ),
        ],
        ["Collages"],
      ),
      h.div(
        [h.Class("grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4")],
        collages.map((collage) =>
          lazyCollageCard(collage.id, collageCardView, [
            collage,
            model.grid,
            model.collageThumbSizes,
            model.confirmingCollageDelete,
            h,
          ])!,
        ),
      ),
    ],
  );

const collageCardView = (
  collage: CollageRecord,
  grid: Model["grid"],
  thumbSizes: Model["collageThumbSizes"],
  confirmingId: Model["confirmingCollageDelete"],
  h: HtmlBuilder<GalleryMessage>,
): Html => {
  const m = {
    grid,
    collageThumbSizes: thumbSizes,
    confirmingCollageDelete: confirmingId,
    // SAFETY: narrow slice for lazy memoization — only fields the view island reads
  } as unknown as Model;
  return collageCard(h, collage, m);
};

const collageCard = (
  h: HtmlBuilder<GalleryMessage>,
  collage: CollageRecord,
  model: Model,
) => {
  const byId = new Map(
    model.grid._tag === "Success" ? model.grid.data.map((s) => [s.id, s]) : [],
  );
  const confirming = model.confirmingCollageDelete === collage.id;
  return h.div(
    [
      h.Key(collage.id),
      h.DataAttribute("collage-id", collage.id),
      h.Class(
        `group relative aspect-square overflow-hidden rounded border bg-panel hover:border-muted ${
          confirming ? "border-accent" : "border-border"
        }`,
      ),
    ],
    [
      // The mini-preview doubles as the open click target; the confirm and
      // delete controls sit above it so their clicks don't bubble.
      h.button(
        [
          h.OnClick(CollageOpenRequested({ id: collage.id })),
          h.AriaLabel(`Open collage with ${collage.tiles.length} photos`),
          h.DataAttribute("open-collage-id", collage.id),
          h.Class("absolute inset-0"),
        ],
        [miniPreview(h, collage, byId, model.collageThumbSizes)],
      ),
      h.div(
        [
          h.Class(
            `absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1 ${
              // The armed confirm must stay reachable without hover.
              confirming ? "opacity-100" : hoverReveal
            }`,
          ),
        ],
        [
          h.span(
            [h.Class("text-[10px] text-white/80 tnum")],
            [
              `${collage.tiles.length} ${collage.tiles.length === 1 ? "photo" : "photos"} · ${
                collage.savedAt > 0
                  ? DateTime.formatLocal({ dateStyle: "short" })(
                      DateTime.makeUnsafe(collage.savedAt),
                    )
                  : ""
              }`,
            ],
          ),
          h.div(
            [h.Class("relative z-10 flex items-center gap-1")],
            confirming
              ? [
                  // ADR-0022's two-step inline confirm: red confirm + undo.
                  h.button(
                    [
                      h.OnClick(CollageDeleteRequested({ id: collage.id })),
                      h.AriaLabel("Confirm deleting this collage"),
                      h.DataAttribute("confirm-delete-collage-id", collage.id),
                      h.Class(
                        "grid size-7 place-items-center text-red-400 hover:text-red-300",
                      ),
                    ],
                    [icon(h, X, "Confirm deleting this collage")],
                  ),
                  h.button(
                    [
                      h.OnClick(CollageDeleteConfirmCancelled()),
                      h.AriaLabel("Cancel deleting this collage"),
                      h.DataAttribute("cancel-delete-collage-id", collage.id),
                      h.Class(
                        "grid size-7 place-items-center text-white/80 hover:text-white",
                      ),
                    ],
                    [icon(h, Undo2, "Cancel deleting this collage")],
                  ),
                ]
              : [
                  h.button(
                    [
                      h.OnClick(
                        ToggledCollageDeleteConfirm({ id: collage.id }),
                      ),
                      h.AriaLabel("Delete this collage"),
                      h.DataAttribute("delete-collage-id", collage.id),
                      h.Class(
                        "grid size-7 place-items-center text-white/80 hover:text-white",
                      ),
                    ],
                    [icon(h, X, "Delete this collage")],
                  ),
                ],
          ),
        ],
      ),
    ],
  );
};

/**
 * The CSS-grid mini-preview: layout-faithful (frame ratio included), and
 * tiles with custom framing mirror it through the same placement math the
 * collage screen and export use; default-framed tiles stay cover-cropped.
 */
const miniPreview = (
  h: HtmlBuilder<GalleryMessage>,
  collage: CollageRecord,
  byId: Map<EditId, EditSummary>,
  sizes: Model["collageThumbSizes"],
) => {
  const cell = cellSize(
    collage.layout,
    Math.max(1, collage.tiles.length),
    1000,
  );
  const cellAspect = cell.width / cell.height;
  // Mirror the screen's explicit M×N grid: spare capacity renders as
  // background cells (docs/adr/0035).
  const columns = Math.max(1, Math.round(collage.layout.columns));
  const rows = effectiveRowCount(collage.layout, collage.tiles.length);
  const empties = Array.from(
    { length: Math.max(0, columns * rows - collage.tiles.length) },
    (_, i) => h.div([h.Key(`empty-${i}`), h.Class("h-full w-full")], []),
  );
  return h.div(
    [
      h.Class("flex h-full w-full items-center justify-center p-1"),
      h.Style({
        backgroundColor:
          collage.layout.background === "dark" ? "#000000" : "#ffffff",
      }),
    ],
    [
      h.div(
        [
          h.Class("grid h-full w-full"),
          h.Style({
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: `${Math.max(1, Math.round(collage.layout.gutter / 4))}px`,
          }),
        ],
        [
          ...collage.tiles.map((tileRef) => {
            const summary = byId.get(tileRef.editId);
            const url = summary
              ? thumbnailUrl(summary.id, summary.thumbnail)
              : null;
            if (!url) {
              return h.div(
                [
                  h.Key(tileRef.editId),
                  h.Class("h-full w-full bg-neutral-700"),
                ],
                [],
              );
            }
            if (isDefaultFraming(tileRef.framing)) {
              return h.img([
                h.Key(tileRef.editId),
                h.Src(url),
                h.Alt(""),
                h.Class("h-full w-full object-cover"),
              ]);
            }
            const size = sizes.find((s) => s.editId === tileRef.editId);
            if (!size || size.width <= 0 || size.height <= 0) {
              return h.img([
                h.Key(tileRef.editId),
                h.Src(url),
                h.Alt(""),
                h.Class("h-full w-full object-cover"),
              ]);
            }
            const p = placement(
              tileRef.framing,
              size.width / size.height,
              cellAspect,
            );
            return h.div(
              [
                h.Key(tileRef.editId),
                h.Class("relative h-full w-full overflow-hidden"),
              ],
              [
                h.img([
                  h.Src(url),
                  h.Alt(""),
                  h.Class("absolute max-w-none"),
                  h.Style({
                    width: `${p.width * 100}%`,
                    height: `${p.height * 100}%`,
                    left: `${p.left * 100}%`,
                    top: `${p.top * 100}%`,
                  }),
                ]),
              ],
            );
          }),
          ...empties,
        ],
      ),
    ],
  );
};
