import { Match as M, Option } from 'effect'
import { Command, Update } from 'foldkit'
import * as Dialog from '@/components/ui/dialog'
import type { EditStore, CollageStore, EditSummary } from '@lutra/store'
import { GalleryMessage, GalleryOutMessage, PhotoCreateError } from './message'
import {
  AddFiles,
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

export type UpdateReturn = Update.ReturnWithOutMessage<
  Model,
  GalleryMessage,
  GalleryOutMessage,
  EditStore | CollageStore
>

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
 * The Gallery Submodel's update loop (docs/adr/0006-frontend-architecture). Returns the
 * `{ model, commands?, outMessage? }` object: the OutMessage is how the
 * gallery tells the root "open this edit" — the root owns navigation. Most
 * arms omit outMessage.
 */
export const update = (model: Model, message: GalleryMessage): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tags({
      EditsListed: ({ summaries }) => ({ model: withSummaries(model, summaries) }),
      ListFailed: ({ error }) => ({
        model: { ...model, grid: editList.Failure({ error }) },
      }),
      RefreshRequested: () => ({ model, commands: [ListEdits()] }),

      ClickedEdit: ({ id }) => ({ model, outMessage: GalleryOutMessage.OpenedEdit({ id }) }),

      DeleteConfirmRequested: ({ id }) => {
        const { model: deleteDialog, commands: dialogCommands = [] } = Dialog.open(
          model.deleteDialog,
        )
        return {
          model: { ...model, pendingDelete: id, deleteDialog },
          commands: Command.mapMessages(dialogCommands, toDeleteDialogMessage),
        }
      },
      DeleteRequested: ({ id }) => {
        const { model: deleteDialog, commands: dialogCommands = [] } = Dialog.close(
          model.deleteDialog,
        )
        return {
          model: { ...model, pendingDelete: null, deleteDialog },
          commands: [
            DeleteEdit({ id }),
            ...Command.mapMessages(dialogCommands, toDeleteDialogMessage),
          ],
        }
      },
      EditDeleted: () => ({ model, commands: [ListEdits()] }),
      DeleteFailed: ({ error }) => ({
        model: { ...model, notice: `Delete failed: ${error.message}` },
      }),

      // collage selection (docs/adr/0009-collage)
      ToggledSelection: ({ id }) => {
        const selected = model.selection.some((selected) => selected === id)
        const selection = selected
          ? model.selection.filter((selected) => selected !== id)
          : [...model.selection, id]
        return { model: { ...model, selection } }
      },
      CreateCollageRequested: () => ({
        model,
        commands: [CreateCollage({ editIds: model.selection })],
      }),
      CollageCreated: ({ id }) => ({
        model: { ...model, selection: [] },
        outMessage: GalleryOutMessage.CreatedCollage({ id }),
      }),
      CollageCreateFailed: ({ error }) => ({
        model: { ...model, notice: `Could not create the collage: ${error.message}` },
      }),

      // collage section (docs/adr/0009-collage): list + open + delete
      CollagesListed: ({ collages }) => {
        // mini-previews can mirror the framing (docs/adr/0009-collage); the grid's
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
        return {
          model: { ...model, collages: collageList.Success({ data: collages }) },
          commands: thumbs.length > 0 ? [MeasureCollageThumbs({ thumbs })] : [],
        }
      },
      CollageThumbsMeasured: ({ sizes }): UpdateReturn => ({
        model: {
          ...model,
          collageThumbSizes: [
            ...model.collageThumbSizes.filter((s) => !sizes.some((n) => n.editId === s.editId)),
            ...sizes,
          ],
        },
      }),
      CollageListFailed: ({ error }) => ({
        model: { ...model, collages: collageList.Failure({ error }) },
      }),
      CollageOpenRequested: ({ id }) => ({
        model,
        outMessage: GalleryOutMessage.OpenedCollage({ id }),
      }),
      ToggledCollageDeleteConfirm: ({ id }) => ({
        model: {
          ...model,
          confirmingCollageDelete: model.confirmingCollageDelete === id ? null : id,
        },
      }),
      CollageDeleteConfirmCancelled: () => ({
        model: { ...model, confirmingCollageDelete: null },
      }),
      CollageDeleteRequested: ({ id }) => ({ model, commands: [DeleteCollage({ id })] }),
      CollageDeleted: () => ({
        model: { ...model, confirmingCollageDelete: null },
        commands: [ListCollages()],
      }),
      CollageDeleteFailed: ({ error }) => ({
        model: {
          ...model,
          confirmingCollageDelete: null,
          notice: `Could not delete the collage: ${error.message}`,
        },
      }),

      OpenPhotoRequested: () => ({ model, commands: [OpenPhoto()] }),
      DragEntered: () => ({ model: { ...model, dragOver: true } }),
      DragLeft: () => ({ model: { ...model, dragOver: false } }),
      FilesDropped: ({ files }) => ({
        model: { ...model, dragOver: false },
        commands: [AddFiles({ files: [...files] })],
      }),
      FilesPasted: ({ files }) => ({ model, commands: [AddFiles({ files: [...files] })] }),
      PhotoPickCancelled: () => ({ model }),
      PhotoCreated: ({ id }) => ({ model, outMessage: GalleryOutMessage.OpenedEdit({ id }) }),
      PhotoCreateFailed: ({ error }) => ({
        model: { ...model, notice: `Could not open photo: ${error.message}` },
      }),
      // Several photos opened at once (docs/adr/0010-editor-ui): stay here — no editor
      PhotosAdded: ({ added, failed, error, summaries }) => ({
        model: {
          ...(Option.isSome(summaries) ? withSummaries(model, summaries.value) : model),
          notice:
            failed === 0
              ? null
              : added === 0
                ? `Could not open photo: ${describeFailure(error)}`
                : `Added ${added} photos, ${failed} could not be opened: ${describeFailure(error)}`,
        },
      }),

      SettingsRequested: () => {
        const { model: dialog, commands: dialogCommands = [] } = Dialog.open(model.settingsDialog)
        return {
          model: { ...model, settingsDialog: dialog },
          commands: Command.mapMessages(dialogCommands, toSettingsDialogMessage),
        }
      },
      GotSettingsDialogMessage: ({ message }) => {
        const { model: dialog, commands: dialogCommands = [] } = Dialog.update(
          model.settingsDialog,
          message,
        )
        return {
          model: { ...model, settingsDialog: dialog },
          commands: Command.mapMessages(dialogCommands, toSettingsDialogMessage),
        }
      },
      GotDeleteDialogMessage: ({ message }) => {
        const { model: dialog, commands: dialogCommands = [] } = Dialog.update(
          model.deleteDialog,
          message,
        )
        const next = message._tag === 'RequestedClose' ? { ...model, pendingDelete: null } : model
        return {
          model: {
            ...next,
            deleteDialog: dialog,
          },
          commands: Command.mapMessages(dialogCommands, toDeleteDialogMessage),
        }
      },
      ToggledInfiniteCanvas: ({ isEnabled }) => ({
        model: { ...model, experimental: { ...model.experimental, infiniteCanvas: isEnabled } },
      }),
    }),
    M.exhaustive,
  )

const toSettingsDialogMessage = (message: Dialog.Message): GalleryMessage =>
  GalleryMessage.GotSettingsDialogMessage({ message })

const toDeleteDialogMessage = (message: Dialog.Message): GalleryMessage =>
  GalleryMessage.GotDeleteDialogMessage({ message })
