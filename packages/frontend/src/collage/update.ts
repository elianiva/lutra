import { Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import type { GpuBackend } from '../gpu/backend'
import type { LutStore } from '../luts/store'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { Collage, CollageStore, EditStore } from '@lutra/store'
import type { ExportSettings } from '@lutra/engine'
import { StoreError as StoreErrorClass } from '@lutra/store'
import type { CollageMessage } from './message'
import { GotCollageExportDialogMessage } from './message'
import {
  EncodeCollageExport,
  DownloadCollageExport,
  NavigateMenu,
  RevokeCollageExportUrl,
  SaveCollage,
  SaveCollageExportSettings,
  SnapshotCollageExport,
} from './command'
import type { Model } from './model'
import { loadedCollage } from './model'
import { moveTile, removeTile } from './tiles'
import { clearExportFrame } from './export-frame'


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

/** Layout control bounds — the record stores plain numbers; the screen clamps. */
export const LAYOUT_BOUNDS = {
  minColumns: 2,
  maxColumns: 6,
  minGutter: 0,
  maxGutter: 32,
} as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

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

      // ---- arrangement (each mutation auto-saves) ----
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
      RemovedTile: ({ index }) => mutate(model, (c) => ({ ...c, tiles: removeTile(c.tiles, index) })),
      MovedTile: ({ from, to }) => mutate(model, (c) => ({ ...c, tiles: moveTile(c.tiles, from, to) })),

      // ---- auto-save ----
      CollageSaved: () => [model, [], Option.none()],
      SaveFailed: ({ error }) => [
        { ...model, notice: `Could not save the collage: ${error.message}` },
        [],
        Option.none(),
      ],

      // ---- export (mirrors the editor's dialog flow) ----
      ExportRequested: () => {
        if (model.collage._tag !== 'Success') {
          return [model, [], Option.none()]
        }
        const [dialog, dialogCommands] = Dialog.open(model.exportDialog)
        return [
          { ...model, exportDialog: dialog, exportDownloaded: false },
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
      GotCollageExportDialogMessage: ({ message }) => {
        const [dialog, dialogCommands, out] = Dialog.update(model.exportDialog, message)
        let next: Model = { ...model, exportDialog: dialog }
        let commands = Command.mapMessages(dialogCommands, toExportDialogMessage)
        // On close: drop the composed frame and revoke the blob URL. The
        // settings stay — they persist across sessions.
        if (Option.isSome(out) && out.value._tag === 'Closed') {
          clearExportFrame()
          next = {
            ...next,
            exportDownloaded: false,
            exportEncoding: false,
            exportError: null,
            exportReady: false,
            exportSize: null,
            exportUrl: null,
          }
          if (model.exportUrl) {
            commands = [...commands, RevokeCollageExportUrl({ url: model.exportUrl })]
          }
        }
        return [next, commands, Option.none()]
      },
      // The composed frame landed in the export-frame cache for the
      // dialog's lifetime; a late compose after close is dropped.
      CollageExportSnapshotted: ({ failedTiles }) => {
        if (!model.exportDialog.isOpen) {
          clearExportFrame()
          return [model, [], Option.none()]
        }
        return [
          {
            ...model,
            exportError: null,
            exportReady: true,
            notice:
              failedTiles > 0
                ? `${failedTiles} ${failedTiles === 1 ? 'photo could not be rendered' : 'photos could not be rendered'} and show as blank`
                : model.notice,
          },
          [],
          Option.none(),
        ]
      },
      CollageExportSnapshotFailed: ({ message }) => [
        { ...model, exportError: message },
        [],
        Option.none(),
      ],
      ChangedCollageExportFormat: ({ format }) =>
        settingsChanged(model, {
          ...model.exportSettings,
          format,
          quality: format === 'png' ? null : (model.exportSettings.quality ?? 75),
        }),
      ChangedCollageExportQuality: ({ quality }) =>
        settingsChanged(model, { ...model.exportSettings, quality }),
      ChangedCollageExportScale: ({ scale }) =>
        settingsChanged(model, { ...model.exportSettings, scale }),
      CollageEncodePrepared: ({ sizeBytes, url }) => {
        // An encode that completed after the dialog closed has no consumer.
        if (!model.exportDialog.isOpen) {
          return [model, [RevokeCollageExportUrl({ url })], Option.none()]
        }
        const filename = `lutra-collage.${model.exportSettings.format}`
        return [
          {
            ...model,
            exportEncoding: false,
            exportError: null,
            exportSize: sizeBytes,
            exportUrl: url,
          },
          [DownloadCollageExport({ filename, url })],
          Option.none(),
        ]
      },
      CollageEncodeFailed: ({ message }) => [
        { ...model, exportEncoding: false, exportError: message },
        [],
        Option.none(),
      ],
      CollageDownloadRequested: () => {
        // The encode runs here, on Export press — not on settings change.
        if (!model.exportReady || model.exportEncoding) {
          return [model, [], Option.none()]
        }
        return [
          {
            ...model,
            exportDownloaded: false,
            exportEncoding: true,
            exportError: null,
            exportSize: null,
            exportUrl: null,
          },
          [
            EncodeCollageExport({
              previousUrl: model.exportUrl,
              settings: model.exportSettings,
            }),
          ],
          Option.none(),
        ]
      },
      CollageDownloaded: ({ url }) => {
        // Ignore downloads of a replaced blob (an encode finished after a
        // newer Export press).
        if (model.exportUrl !== url) {
          return [model, [], Option.none()]
        }
        return [{ ...model, exportDownloaded: true }, [], Option.none()]
      },
      CollageExportSettingsLoaded: ({ settings }) => [
        { ...model, exportSettings: settings },
        [],
        Option.none(),
      ],
      CollageExportSettingsSaved: () => [model, [], Option.none()],
      CollageExportUrlRevoked: () => [model, [], Option.none()],

      BackRequested: () => [model, [NavigateMenu()], Option.none()],
      // Observability only — the URL change drives the route transition.
      NavigatedBack: () => [model, [], Option.none()],
    }),
    M.exhaustive,
  )


const toExportDialogMessage = (message: Dialog.Message): CollageMessage =>
  GotCollageExportDialogMessage({ message })

/** Persist a settings change; the encode waits for the Export press. */
const settingsChanged = (model: Model, settings: ExportSettings): UpdateReturn => [
  { ...model, exportDownloaded: false, exportSettings: settings },
  [SaveCollageExportSettings({ settings })],
  Option.none(),
]
