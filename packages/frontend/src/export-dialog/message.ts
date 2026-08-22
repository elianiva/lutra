import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { ExportFormat, ExportQuality, ExportScale, ExportSettings } from '@lutra/engine'

/**
 * The shared export dialog machine's messages (docs/adr/0031). The owning
 * screen wraps them as `GotExportDialogMessage` at its own boundary and
 * feeds snapshot outcomes in through `FrameReady` / `FrameFailed`.
 */

/** Wraps the @foldkit/ui Dialog submodel's messages. */
export const GotDialogMessage = Message.m('GotDialogMessage', {
  message: Dialog.Message,
})

// ---- frame (the owning screen's snapshot landed) ----

/**
 * The composed/readback frame landed in the frame slot. A result that lands
 * after the dialog closed is dropped along with its pixels.
 */
export const FrameReady = Message.m('FrameReady')
/** The owning screen could not produce a frame; `message` is shown in the status line. */
export const FrameFailed = Message.m('FrameFailed', { message: S.String })

// ---- settings (persisted on every change; encode waits for Export press) ----

export const ChangedFormat = Message.m('ChangedFormat', { format: ExportFormat })
export const ChangedQuality = Message.m('ChangedQuality', { quality: ExportQuality })
export const ChangedScale = Message.m('ChangedScale', { scale: ExportScale })
export const SettingsLoaded = Message.m('SettingsLoaded', { settings: ExportSettings })
export const SettingsSaved = Message.m('SettingsSaved')

// ---- encode + download (runs on Export press, not on settings change) ----

export const EncodeRequested = Message.m('EncodeRequested')
/** An encode completed: size + object URL of the encoded blob; the download fires from here. */
export const EncodePrepared = Message.m('EncodePrepared', {
  sizeBytes: S.Number,
  url: S.String,
})
/** An encode failed; `message` is shown in the status line. */
export const EncodeFailed = Message.m('EncodeFailed', { message: S.String })
/** The download was triggered. */
export const Downloaded = Message.m('Downloaded', { url: S.String })

/** Ack for the revoke command (observability). */
export const UrlRevoked = Message.m('UrlRevoked')

export const ExportDialogMessage = S.Union([
  GotDialogMessage,
  FrameReady,
  FrameFailed,
  ChangedFormat,
  ChangedQuality,
  ChangedScale,
  SettingsLoaded,
  SettingsSaved,
  EncodeRequested,
  EncodePrepared,
  EncodeFailed,
  Downloaded,
  UrlRevoked,
])
export type ExportDialogMessage = typeof ExportDialogMessage.Type
