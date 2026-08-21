import { Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import type { EditStore, CollageStore } from '@lutra/store'
import type { GalleryMessage, GalleryOutMessage } from './message'
import { CreatedCollage, OpenedCollage, OpenedEdit, GotSettingsDialogMessage } from './message'
import { CreateCollage, DeleteCollage, DeleteEdit, ListCollages, ListEdits, OpenPhoto } from './command'
import type { Model } from './model'
import { collageList, editList } from './model'

export type UpdateReturn = readonly [
  Model,
  readonly Command.Command<GalleryMessage, never, EditStore | CollageStore>[],
  Option.Option<GalleryOutMessage>,
]

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
      EditsListed: ({ summaries }) => [
        {
          ...model,
          grid: editList.Success({ data: summaries }),
          notice: null,
          // Prune the collage selection to edits that still exist — a tile
          // deleted elsewhere must not join a new collage as a dangling ref.
          selection: model.selection.filter((id) => summaries.some((s) => s.id === id)),
        },
        [],
        Option.none(),
      ],
      ListFailed: ({ error }) => [
        { ...model, grid: editList.Failure({ error }) },
        [],
        Option.none(),
      ],
      RefreshRequested: () => [model, [ListEdits()], Option.none()],

      // A tile clicked: surface the fact upward and let the root navigate.
      ClickedEdit: ({ id }) => [model, [], Option.some(OpenedEdit({ id }))],

      DeleteRequested: ({ id }) => [model, [DeleteEdit({ id })], Option.none()],
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
      CreateCollageRequested: () => [model, [CreateCollage({ editIds: model.selection })], Option.none()],
      // Persisted: surface it upward — the root pushes `/collage/:id` — and
      // clear the selection (the arrangement now lives in its own record).
      CollageCreated: ({ id }) => [{ ...model, selection: [] }, [], Option.some(CreatedCollage({ id }))],
      CollageCreateFailed: ({ error }) => [
        { ...model, notice: `Could not create the collage: ${error.message}` },
        [],
        Option.none(),
      ],

      // ---- collage section (docs/adr/0030): list + open + delete ----
      CollagesListed: ({ collages }) => [
        { ...model, collages: collageList.Success({ data: collages }) },
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
      CollageOpenRequested: ({ id }) => [model, [], Option.some(OpenedCollage({ id }))],
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
      CollageDeleteConfirmCancelled: () => [{ ...model, confirmingCollageDelete: null }, [], Option.none()],
      CollageDeleteRequested: ({ id }) => [model, [DeleteCollage({ id })], Option.none()],
      CollageDeleted: () => [
        { ...model, confirmingCollageDelete: null },
        [ListCollages()],
        Option.none(),
      ],
      CollageDeleteFailed: ({ error }) => [
        { ...model, confirmingCollageDelete: null, notice: `Could not delete the collage: ${error.message}` },
        [],
        Option.none(),
      ],

      // ---- open a photo (new edit) ----
      OpenPhotoRequested: () => [model, [OpenPhoto()], Option.none()],
      PhotoPickCancelled: () => [model, [], Option.none()],
      // A new Edit persisted: surface it upward — the root pushes the editor
      // URL, exactly as if the user had clicked the tile.
      PhotoCreated: ({ id }) => [model, [], Option.some(OpenedEdit({ id }))],
      PhotoCreateFailed: ({ error }) => [
        { ...model, notice: `Could not open photo: ${error.message}` },
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
  GotSettingsDialogMessage({ message })
