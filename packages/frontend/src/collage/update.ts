import { Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import type { GpuBackend } from '../gpu/backend'
import type { LutStore } from '../luts/store'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { Collage, CollageStore, EditStore } from '@lutra/store'
import { StoreError as StoreErrorClass } from '@lutra/store'
import * as ExportDialog from '../export-dialog'
import type { CollageMessage } from './message'
import { GotCollageExportDialogMessage } from './message'
import { NavigateMenu, SaveCollage, SnapshotCollageExport } from './command'
import type { Model } from './model'
import { LAYOUT_BOUNDS, clamp, loadedCollage } from './model'
import { moveTile, removeTile } from './tiles'

type Resource =
  | GpuBackend
  | LutStore
  | ImageEncoder
  | KeyValueStore
  | CollageStore
  | EditStore

export type UpdateReturn = readonly [
  Model,
  readonly Command.Command<CollageMessage, never, Resource>[],
  Option.Option<never>,
]

/**
 * Mutate the loaded collage's arrangement and queue an auto-save
 * (docs/adr/0030). Arrangement messages with no edge while nothing is loaded
 * are ignored — that IS the blocking, with no scattered guards.
 */
const mutate = (model: Model, f: (collage: Collage) => Collage): UpdateReturn => {
  if (model.collage._tag !== 'Success') {
    return [model, [], Option.none()]
  }
  const collage = f(model.collage.data)
  return [
    { ...model, collage: loadedCollage.Success({ data: collage }) },
    [SaveCollage({ collage })],
    Option.none(),
  ]
}

/** The shared export-dialog machine's messages ride the collage boundary. */
const toExportDialogMessage = (message: ExportDialog.Message): CollageMessage =>
  GotCollageExportDialogMessage({ message })

/** Step the export-dialog machine and lift its results into the collage. */
const delegate = (
  model: Model,
  message: ExportDialog.Message,
  notice: string | null = model.notice,
): UpdateReturn => {
  const [dialogModel, commands] = ExportDialog.update(model.exportDialog, message)
  return [
    { ...model, exportDialog: dialogModel, notice },
    Command.mapMessages(commands, toExportDialogMessage),
    Option.none(),
  ]
}

/**
 * The Collage Submodel's update loop (docs/adr/0009): the same
 * `[Model, Commands, Option<OutMessage>]` 3-tuple shape as the gallery and
 * editor. The collage surfaces no OutMessage facts, so the third slot is
 * always `Option.none()`.
 */
export const update = (model: Model, message: CollageMessage): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tags({
      CollageLoaded: ({ collage, thumbs, dropped }) => [
        {
          ...model,
          collage: loadedCollage.Success({ data: collage }),
          thumbs,
          notice:
            dropped > 0
              ? `${dropped} ${dropped === 1 ? 'photo' : 'photos'} removed — their edits were deleted`
              : null,
        },
        [],
        Option.none(),
      ],
      LoadFailed: ({ error }) => [
        { ...model, collage: loadedCollage.Failure({ error }) },
        [],
        Option.none(),
      ],
      // The id was well-formed but the record is gone: show the same failure
      // state with a plain-language reason (a synthetic StoreError carries
      // the message; there is no backend behind it).
      CollageMissing: () => [
        {
          ...model,
          collage: loadedCollage.Failure({
            error: new StoreErrorClass({ message: 'this collage does not exist' }),
          }),
        },
        [],
        Option.none(),
      ],

      // ---- arrangement (each mutation auto-saves; bounds live in model.ts) ----
      ChangedColumns: ({ columns }) =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            columns: clamp(Math.round(columns), LAYOUT_BOUNDS.minColumns, LAYOUT_BOUNDS.maxColumns),
          },
        })),
      ChangedGutter: ({ gutter }) =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            gutter: clamp(Math.round(gutter), LAYOUT_BOUNDS.minGutter, LAYOUT_BOUNDS.maxGutter),
          },
        })),
      ToggledBackground: () =>
        mutate(model, (c) => ({
          ...c,
          layout: { ...c.layout, background: c.layout.background === 'dark' ? 'light' : 'dark' },
        })),
      RemovedTile: ({ index }) =>
        mutate(model, (c) => ({ ...c, tiles: removeTile(c.tiles, index) })),
      MovedTile: ({ from, to }) =>
        mutate(model, (c) => ({ ...c, tiles: moveTile(c.tiles, from, to) })),

      // ---- auto-save ----
      CollageSaved: () => [model, [], Option.none()],
      SaveFailed: ({ error }) => [
        { ...model, notice: `Could not save the collage: ${error.message}` },
        [],
        Option.none(),
      ],

      // ---- export (docs/adr/0031: compose on open, encode on press) ----
      ExportRequested: () => {
        if (model.collage._tag !== 'Success') {
          return [model, [], Option.none()]
        }
        const [dialogModel, dialogCommands] = ExportDialog.open(model.exportDialog)
        return [
          { ...model, exportDialog: dialogModel },
          [
            ...Command.mapMessages(dialogCommands, toExportDialogMessage),
            SnapshotCollageExport({
              editIds: model.collage.data.tiles.map((t) => t.editId),
              layout: model.collage.data.layout,
            }),
          ],
          Option.none(),
        ]
      },
      // A failed-tile count surfaces as a notice before the machine takes
      // over; the readiness flag and late-result guards live in the machine.
      CollageExportSnapshotted: ({ failedTiles }) =>
        delegate(
          model,
          ExportDialog.FrameReady(),
          failedTiles > 0
            ? `${failedTiles} ${failedTiles === 1 ? 'photo could not be rendered' : 'photos could not be rendered'} and show as blank`
            : model.notice,
        ),
      CollageExportSnapshotFailed: ({ message }) =>
        delegate(model, ExportDialog.FrameFailed({ message }), model.notice),

      BackRequested: () => [model, [NavigateMenu()], Option.none()],
      // Observability only — the URL change drives the route transition.
      NavigatedBack: () => [model, [], Option.none()],
      GotCollageExportDialogMessage: ({ message }) => delegate(model, message),
    }),
    M.exhaustive,
  )
