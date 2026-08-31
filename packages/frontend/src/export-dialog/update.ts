import { Match as M } from 'effect'
import { Command, Update } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { ExportDialogMessage as Message } from './message'
import { ExportDownload, PrepareExport, RevokeExportUrl, SaveExportSettings } from './command'
import type { Resource } from './command'
import type { Model } from './model'
import { clearFrame } from './frame'

export type UpdateReturn = Update.Return<Model, Message, Resource>

/** The dialog's filename in header and download: `<stem>.<format>`. */
export const filenameFor = (model: Model): string => `${model.fileStem}.${model.settings.format}`

/**
 * Open the dialog for a fresh export session: any prior result state is
 * dropped (the snapshot that follows will re-slot the frame). Returns the
 * model and the mapped commands — the caller fires its own snapshot
 * alongside them.
 */
export const open = (model: Model): UpdateReturn => {
  const fresh: Model = { ...model, downloaded: false, error: null, ready: false }
  const { model: dialog, commands: dialogCommands = [] } = Dialog.open(fresh.dialog)
  return { model: { ...fresh, dialog }, commands: dialogCommands.map(wrapDialogCommand) }
}

/**
 * The shared export-dialog machine's update (docs/adr/0004-export) — one
 * implementation of the flow the editor and the collage screens previously
 * each carried. Close cleanup is internal: the frame slot is dropped,
 * result flags reset, and a held blob URL revoked.
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tags({
      GotDialogMessage: ({ message }) => delegateToDialog(model, message),

      // A frame slotted after close has no consumer — drop it with its pixels.
      FrameReady: () => {
        if (!model.dialog.isOpen) {
          clearFrame()
          return { model }
        }
        return { model: { ...model, error: null, ready: true } }
      },
      FrameFailed: ({ message }) => ({
        model: { ...model, error: model.dialog.isOpen ? message : null },
      }),

      // settings: persist; the encode waits for the Export press
      ChangedFormat: ({ format }) =>
        settingsChanged(model, {
          ...model.settings,
          format,
          quality: format === 'png' ? null : (model.settings.quality ?? 75),
        }),
      ChangedQuality: ({ quality }) => settingsChanged(model, { ...model.settings, quality }),
      ChangedScale: ({ scale }) => settingsChanged(model, { ...model.settings, scale }),
      SettingsLoaded: ({ settings }) => ({ model: { ...model, settings } }),

      EncodeRequested: () => {
        // The encode runs here, on Export press — not on settings change.
        if (!model.ready || model.encoding) {
          return { model }
        }
        return {
          model: {
            ...model,
            downloaded: false,
            encoding: true,
            error: null,
            size: null,
            url: null,
          },
          commands: [PrepareExport({ previousUrl: model.url, settings: model.settings })],
        }
      },
      EncodePrepared: ({ sizeBytes, url }) => {
        // An encode that completed after the dialog closed has no consumer.
        if (!model.dialog.isOpen) {
          return { model, commands: [RevokeExportUrl({ url })] }
        }
        return {
          model: { ...model, encoding: false, error: null, size: sizeBytes, url },
          commands: [ExportDownload({ filename: filenameFor(model), url })],
        }
      },
      // The failure stays on screen; Export re-encodes for a retry.
      EncodeFailed: ({ message }) => ({ model: { ...model, encoding: false, error: message } }),
      Downloaded: ({ url }) => {
        // Ignore downloads of a replaced blob (an encode finished after a
        // newer Export press).
        if (model.url !== url) {
          return { model }
        }
        return { model: { ...model, downloaded: true } }
      },

      // acks (observability only)
      SettingsSaved: () => ({ model }),
      UrlRevoked: () => ({ model }),
    }),
    M.exhaustive,
  )

const settingsChanged = (model: Model, settings: Model['settings']): UpdateReturn => ({
  model: { ...model, downloaded: false, settings },
  commands: [SaveExportSettings({ settings })],
})

/**
 * Run the @foldkit/ui Dialog submodel and lift its results. On close: drop
 * the frame slot and revoke a held blob URL. The settings stay — they
 * persist across sessions.
 */
const delegateToDialog = (model: Model, message: Dialog.Message): UpdateReturn => {
  const {
    model: dialog,
    commands: dialogCommands = [],
    outMessage: out,
  } = Dialog.update(model.dialog, message)
  let next: Model = { ...model, dialog }
  let commands = dialogCommands.map(wrapDialogCommand)
  if (out?._tag === 'Closed') {
    clearFrame()
    next = { ...next, encoding: false, error: null, ready: false, size: null, url: null }
    if (model.url !== null) {
      commands = [...commands, RevokeExportUrl({ url: model.url })]
    }
  }
  return { model: next, commands }
}

const wrapDialogCommand = (
  command: Command.Command<Dialog.Message>,
): Command.Command<Message, never, Resource> =>
  Command.mapMessage(command, (message) => Message.GotDialogMessage({ message }))
