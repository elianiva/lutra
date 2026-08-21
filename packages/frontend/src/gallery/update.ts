import { Match as M, Option } from 'effect'
import type { Command } from 'foldkit'
import type { EditStore, CollageStore, EditId } from '@lutra/store'
import type { GalleryMessage, GalleryOutMessage } from './message'
import { CreatedCollage, OpenedEdit } from './message'
import { CreateCollage, DeleteEdit, ListEdits, OpenPhoto } from './command'
import type { Model } from './model'
import { editList } from './model'

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
    }),
    M.exhaustive,
  )
