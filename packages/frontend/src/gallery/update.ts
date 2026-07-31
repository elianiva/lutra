import { Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { EditStore } from '@lutra/store'
import type { GalleryMessage, GalleryOutMessage } from './message'
import { OpenedEdit } from './message'
import { DeleteEdit, ListEdits } from './command'
import { Model, editList } from './model'

export type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<GalleryMessage, never, EditStore>>,
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
        { ...model, grid: editList.Success({ data: summaries }) },
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
        { ...model, grid: editList.Failure({ error }) },
        [],
        Option.none(),
      ],
    }),
    M.exhaustive,
  )
