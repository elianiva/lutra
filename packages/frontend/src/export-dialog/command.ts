import { Effect, Schema as S } from 'effect'
import { Command } from 'foldkit'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import { EncodeError, ImageEncoder, ExportSettings, mimeFor } from '@lutra/engine'
import { ExportDialogMessage } from './message'
import { peekFrame } from './frame'
import { loadExportSettings, saveExportSettings } from '../export-settings'

/**
 * The shared export dialog machine's commands (docs/adr/0004-export): encode,
 * download, revoke, and settings persistence — one implementation for the
 * editor and the collage screens. The owning screen supplies only its own
 * snapshot command.
 */
export type Resource = ImageEncoder | KeyValueStore

/**
 * Encode the slotted frame with the given settings and report the resulting
 * size + blob URL. Runs once per Export press — there is no live size
 * preview (encoding for it was too slow). The previous blob URL is revoked
 * here; the model's `url` is only ever replaced, never leaked.
 */
export const PrepareExport = Command.define('PrepareExport', {
  args: {
    previousUrl: S.NullOr(S.String),
    settings: ExportSettings,
  },
  execute: ({ settings, previousUrl }) =>
    Effect.gen(function* PrepareExport() {
      const image = peekFrame()
      if (!image) {
        return ExportDialogMessage.EncodeFailed({ message: 'no cached frame to encode' })
      }
      if (previousUrl) {
        yield* Effect.sync(() => {
          URL.revokeObjectURL(previousUrl)
        })
      }
      const encoder = yield* ImageEncoder
      const bytes = yield* encoder.encode({ image, settings })
      // SAFETY: the encoder returned its output over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
      // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
      const blob = new Blob([bytes as BlobPart], { type: mimeFor(settings.format) })
      const url = URL.createObjectURL(blob)
      return ExportDialogMessage.EncodePrepared({ sizeBytes: bytes.byteLength, url })
    }).pipe(
      Effect.catchTag('EncodeError', (err: EncodeError) =>
        Effect.succeed(ExportDialogMessage.EncodeFailed({ message: err.message })),
      ),
    ),
  messages: [ExportDialogMessage.EncodePrepared, ExportDialogMessage.EncodeFailed],
})

/** Trigger the browser download of the encoded blob (the url stays alive
 *  until the dialog closes — the tweak-and-re-export loop needs it). */
export const ExportDownload = Command.define('ExportDownload', {
  args: { filename: S.String, url: S.String },
  execute: ({ url, filename }) =>
    Effect.sync(() => {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      return ExportDialogMessage.Downloaded({ url })
    }),
  messages: [ExportDialogMessage.Downloaded],
})

/** Revoke a blob URL (dialog close, stale encode result). */
export const RevokeExportUrl = Command.define('RevokeExportUrl', {
  args: { url: S.String },
  execute: ({ url }) =>
    Effect.sync(() => {
      URL.revokeObjectURL(url)
    }).pipe(Effect.as(ExportDialogMessage.UrlRevoked())),
  messages: [ExportDialogMessage.UrlRevoked],
})

/** Restore persisted export settings (fired on boot and route changes). */
export const LoadExportSettings = Command.define('LoadExportSettings', {
  execute: Effect.map(loadExportSettings, (settings) =>
    ExportDialogMessage.SettingsLoaded({ settings }),
  ),
  messages: [ExportDialogMessage.SettingsLoaded],
})

/** Persist export settings (fired on every change; localStorage is cheap). */
export const SaveExportSettings = Command.define('SaveExportSettings', {
  args: { settings: ExportSettings },
  execute: ({ settings }) =>
    Effect.as(Effect.ignore(saveExportSettings(settings)), ExportDialogMessage.SettingsSaved()),
  messages: [ExportDialogMessage.SettingsSaved],
})
