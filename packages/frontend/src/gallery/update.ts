import { Match as M, Option } from 'effect'
import { Command, Update } from 'foldkit'
import * as Dialog from '@/components/ui/dialog'
import type { EditStore, EditSummary } from '@lutra/store'
import { GalleryMessage, GalleryOutMessage, PhotoCreateError } from './message'
import { AddFiles, DeleteEdit, ListEdits, OpenPhoto } from './command'
import type { Model } from './model'
import { editList } from './model'

export type UpdateReturn = Update.ReturnWithOutMessage<
  Model,
  GalleryMessage,
  GalleryOutMessage,
  EditStore
>

/**
 * Apply a fresh Edit-summary listing to the model: the grid succeeds with it
 * (notice cleared). Shared by the boot-time listing and the multi-photo open.
 */
const withSummaries = (model: Model, summaries: readonly EditSummary[]): Model => ({
  ...model,
  grid: editList.Success({ data: summaries }),
  notice: null,
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
