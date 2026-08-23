import { Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import type { EditStore, CollageStore, EditSummary } from '@lutra/store'
import { GalleryMessage, GalleryOutMessage, PhotoCreateError } from './message'
import {
  CreateCollage,
  DeleteCollage,
  DeleteEdit,
  ListCollages,
  ListEdits,
  MeasureCollageThumbs,
  OpenPhoto,
} from './command'
import type { Model } from './model'
import { collageList, editList } from './model'
import { isDefaultFraming } from '../collage/framing'

export type UpdateReturn = readonly [
  Model,
  readonly Command.Command<GalleryMessage, never, EditStore | CollageStore>[],
  Option.Option<GalleryOutMessage>,
]

/**
 * Apply a fresh Edit-summary listing to the model: the grid succeeds with it
 * (notice cleared) and the collage selection is pruned to edits that still
 * exist — a tile deleted elsewhere must not join a new collage as a dangling
 * ref. Shared by the boot-time listing and the multi-photo open.
 */
const withSummaries = (model: Model, summaries: readonly EditSummary[]): Model => ({
  ...model,
  grid: editList.Success({ data: summaries }),
  notice: null,
  selection: model.selection.filter((id) => summaries.some((s) => s.id === id)),
})

/** The reason a pick couldn't become an Edit, for the notice banner. */
const describeFailure = (error: Option.Option<typeof PhotoCreateError.Type>): string =>
  Option.match(error, {
    onNone: () => 'unknown error',
    onSome: (failure) => failure.message,
  })

/**
 * The Gallery Submodel's update loop (docs/adr/0009). Returns the
 * `[Model, Commands, Option<OutMessage>]` 3-tuple: the OutMessage is how the
 * gallery tells the root "open this edit" — the root owns navigation. Most
 * arms emit `Option.none()`.
 */
export const update = (model: Model, message: GalleryMessage): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tags({
      EditsListed: ({ summaries }) => [withSummaries(model, summaries), [], Option.none()],
      ListFailed: ({ error }) => [
        { ...model, grid: editList.Failure({ error }) },
        [],
        Option.none(),
      ],
      RefreshRequested: () => [model, [ListEdits()], Option.none()],

      // A tile clicked: surface the fact upward and let the root navigate.
      ClickedEdit: ({ id }) => [model, [], Option.some(GalleryOutMessage.OpenedEdit({ id }))],

      // A tile's ✕: arm the pending delete and open the confirmation
      // dialog (ADR-0022, superseded to a dialog).
      DeleteConfirmRequested: ({ id }) => {
        const [deleteDialog, dialogCommands] = Dialog.open(model.deleteDialog)
        return [
          { ...model, pendingDelete: id, deleteDialog },
          Command.mapMessages(dialogCommands, toDeleteDialogMessage),
          Option.none(),
        ]
      },
      // Confirmed in the dialog: fire the store delete and dismiss the
      // dialog right away — a failure re-surfaces through the notice.
      DeleteRequested: ({ id }) => {
        const [deleteDialog, dialogCommands] = Dialog.close(model.deleteDialog)
        return [
          { ...model, pendingDelete: null, deleteDialog },
          [DeleteEdit({ id }), ...Command.mapMessages(dialogCommands, toDeleteDialogMessage)],
          Option.none(),
        ]
      },
      EditDeleted: () => [model, [ListEdits()], Option.none()],
      DeleteFailed: ({ error }) => [
        { ...model, notice: `Delete failed: ${error.message}` },
        [],
        Option.none(),
      ],

      // ---- collage selection (docs/adr/0030) ----
      ToggledSelection: ({ id }) => {
        const selected = model.selection.some((selected) => selected === id)
        const selection = selected
          ? model.selection.filter((selected) => selected !== id)
          : [...model.selection, id]
        return [{ ...model, selection }, [], Option.none()]
      },
      CreateCollageRequested: () => [
        model,
        [CreateCollage({ editIds: model.selection })],
        Option.none(),
      ],
      // Persisted: surface it upward — the root pushes `/collage/:id` — and
      // clear the selection (the arrangement now lives in its own record).
      CollageCreated: ({ id }) => [
        { ...model, selection: [] },
        [],
        Option.some(GalleryOutMessage.CreatedCollage({ id })),
      ],
      CollageCreateFailed: ({ error }) => [
        { ...model, notice: `Could not create the collage: ${error.message}` },
        [],
        Option.none(),
      ],

      // ---- collage section (docs/adr/0030): list + open + delete ----
      CollagesListed: ({ collages }) => {
        // Custom-framed tiles need their thumbnails' aspects before the
        // mini-previews can mirror the framing (docs/adr/0033); the grid's
        // summaries carry the bytes. Default-framed tiles stay cover.
        const byId = new Map(
          model.grid._tag === 'Success' ? model.grid.data.map((s) => [s.id, s] as const) : [],
        )
        const custom = new Set(
          collages.flatMap((c) =>
            c.tiles.filter((t) => !isDefaultFraming(t.framing)).map((t) => t.editId),
          ),
        )
        const thumbs = [...custom].flatMap((id) => {
          const summary = byId.get(id)
          return summary ? [{ id: summary.id, thumbnail: summary.thumbnail }] : []
        })
        return [
          { ...model, collages: collageList.Success({ data: collages }) },
          thumbs.length > 0 ? [MeasureCollageThumbs({ thumbs })] : [],
          Option.none(),
        ]
      },
      CollageThumbsMeasured: ({ sizes }): UpdateReturn => [
        {
          ...model,
          collageThumbSizes: [
            ...model.collageThumbSizes.filter((s) => !sizes.some((n) => n.editId === s.editId)),
            ...sizes,
          ],
        },
        [],
        Option.none(),
      ],
      CollageListFailed: ({ error }) => [
        { ...model, collages: collageList.Failure({ error }) },
        [],
        Option.none(),
      ],
      // A collage card clicked: surface the fact upward — the root pushes
      // `/collage/:id`, exactly as for a created collage.
      CollageOpenRequested: ({ id }) => [
        model,
        [],
        Option.some(GalleryOutMessage.OpenedCollage({ id })),
      ],
      // ADR-0022's inline two-step confirm: first ✕ arms the card; arming a
      // different card moves the state; ✗ or re-tap disarms.
      ToggledCollageDeleteConfirm: ({ id }) => [
        {
          ...model,
          confirmingCollageDelete: model.confirmingCollageDelete === id ? null : id,
        },
        [],
        Option.none(),
      ],
      CollageDeleteConfirmCancelled: () => [
        { ...model, confirmingCollageDelete: null },
        [],
        Option.none(),
      ],
      CollageDeleteRequested: ({ id }) => [model, [DeleteCollage({ id })], Option.none()],
      CollageDeleted: () => [
        { ...model, confirmingCollageDelete: null },
        [ListCollages()],
        Option.none(),
      ],
      CollageDeleteFailed: ({ error }) => [
        {
          ...model,
          confirmingCollageDelete: null,
          notice: `Could not delete the collage: ${error.message}`,
        },
        [],
        Option.none(),
      ],

      // ---- open photo(s) (new edits) ----
      OpenPhotoRequested: () => [model, [OpenPhoto()], Option.none()],
      PhotoPickCancelled: () => [model, [], Option.none()],
      // A single new Edit persisted: surface it upward — the root pushes the
      // editor URL, exactly as if the user had clicked the tile.
      PhotoCreated: ({ id }) => [model, [], Option.some(GalleryOutMessage.OpenedEdit({ id }))],
      PhotoCreateFailed: ({ error }) => [
        { ...model, notice: `Could not open photo: ${error.message}` },
        [],
        Option.none(),
      ],
      // Several photos opened at once (docs/adr/0032): stay here — no editor
      // navigation; the user edits later by clicking a tile. The command's
      // listing rides in the message so the grid refreshes right now (a
      // follow-up ListEdits would land after this arm and wipe the failure
      // report); when that listing itself failed the grid keeps its state.
      PhotosAdded: ({ added, failed, error, summaries }) => [
        {
          ...(Option.isSome(summaries) ? withSummaries(model, summaries.value) : model),
          notice:
            failed === 0
              ? null
              : added === 0
                ? `Could not open photo: ${describeFailure(error)}`
                : `Added ${added} photos, ${failed} could not be opened: ${describeFailure(error)}`,
        },
        [],
        Option.none(),
      ],

      // ---- settings dialog ----
      SettingsRequested: () => {
        const [dialog, dialogCommands] = Dialog.open(model.settingsDialog)
        return [
          { ...model, settingsDialog: dialog },
          Command.mapMessages(dialogCommands, toSettingsDialogMessage),
          Option.none(),
        ]
      },
      GotSettingsDialogMessage: ({ message }) => {
        const [dialog, dialogCommands] = Dialog.update(model.settingsDialog, message)
        return [
          { ...model, settingsDialog: dialog },
          Command.mapMessages(dialogCommands, toSettingsDialogMessage),
          Option.none(),
        ]
      },
      // Delete-dialog delegation. Every dismissal path (Esc, backdrop click,
      // the Cancel button) arrives as `RequestedClose`, which also disarms
      // the pending delete so a reopened dialog never confirms a stale id.
      GotDeleteDialogMessage: ({ message }) => {
        const [dialog, dialogCommands] = Dialog.update(model.deleteDialog, message)
        // Clear the armed delete only when the dialog actually closed; a
        // conditional spread would hide the omission behind an empty object.
        const next = message._tag === 'RequestedClose' ? { ...model, pendingDelete: null } : model
        return [
          {
            ...next,
            deleteDialog: dialog,
          },
          Command.mapMessages(dialogCommands, toDeleteDialogMessage),
          Option.none(),
        ]
      },
      // Experimental toggles are UI-only for now — the flag flips and
      // nothing else in the app reads it.
      ToggledInfiniteCanvas: ({ isEnabled }) => [
        { ...model, experimental: { ...model.experimental, infiniteCanvas: isEnabled } },
        [],
        Option.none(),
      ],
    }),
    M.exhaustive,
  )

const toSettingsDialogMessage = (message: Dialog.Message): GalleryMessage =>
  GalleryMessage.GotSettingsDialogMessage({ message })

const toDeleteDialogMessage = (message: Dialog.Message): GalleryMessage =>
  GalleryMessage.GotDeleteDialogMessage({ message })
