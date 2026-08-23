import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Dialog } from '@foldkit/ui'
import { ExportFormat, ExportQuality, ExportScale, ExportSettings } from '@lutra/engine'

/**
 * The shared export dialog machine's messages (docs/adr/0031). The owning
 * screen wraps them as `GotExportDialogMessage` at its own boundary and
 * feeds snapshot outcomes in through `FrameReady` / `FrameFailed`.
 */
export const ExportDialogMessage = defineMessageUnion({
  /** Wraps the @foldkit/ui Dialog submodel's messages. */
  GotDialogMessage: {
    message: Dialog.Message,
  },

  // ---- frame (the owning screen's snapshot landed) ----

  /**
   * The composed/readback frame landed in the frame slot. A result that lands
   * after the dialog closed is dropped along with its pixels.
   */
  FrameReady: {},
  /** The owning screen could not produce a frame; `message` is shown in the status line. */
  FrameFailed: { message: S.String },

  // ---- settings (persisted on every change; encode waits for Export press) ----

  ChangedFormat: { format: ExportFormat },
  ChangedQuality: { quality: ExportQuality },
  ChangedScale: { scale: ExportScale },
  SettingsLoaded: { settings: ExportSettings },
  SettingsSaved: {},

  // ---- encode + download (runs on Export press, not on settings change) ----

  EncodeRequested: {},
  /** An encode completed: size + object URL of the encoded blob; the download fires from here. */
  EncodePrepared: {
    sizeBytes: S.Number,
    url: S.String,
  },
  /** An encode failed; `message` is shown in the status line. */
  EncodeFailed: { message: S.String },
  /** The download was triggered. */
  Downloaded: { url: S.String },

  /** Ack for the revoke command (observability). */
  UrlRevoked: {},
})
export type ExportDialogMessage = typeof ExportDialogMessage.Type
