import { Schema as S } from 'effect'
import { Dialog } from '@foldkit/ui'
import { ExportSettings, defaultExportSettings } from '@lutra/engine'

/**
 * The export dialog machine shared by the editor and the collage screens
 * (docs/adr/0004-export): format/quality/scale settings (persisted across
 * sessions), the encode-on-press flow with its blob-URL lifecycle, and the
 * composed/readback frame slot. The owning screen supplies only its
 * snapshot — GPU readback for the editor, grid composition for the collage
 * — and reports it through `FrameReady`.
 *
 * The pixels bypass the TEA model entirely (docs/adr/0004-export): a
 * full-resolution ImageData is megabytes, and routing it through
 * Messages/Model makes every log or devtools snapshot enumerate millions of
 * array cells (observed as a hard crash). The model holds a readiness flag;
 * this module's frame slot holds the pixels for the dialog's lifetime.
 */
export const Model = S.Struct({
  /** Filename stem for downloads and the header (`<stem>.<format>`). */
  fileStem: S.String,
  // The foldkit dialog submodel (open/close/animation state).
  dialog: Dialog.Model,
  // The export settings (format/quality/scale); persisted across sessions.
  settings: ExportSettings,
  // True while a frame is slotted for the open dialog — pressing Export
  // encodes from it without re-rendering.
  ready: S.Boolean,
  // True while an encode runs (the Export button is disabled and shows
  // "Encoding…").
  encoding: S.Boolean,
  // The encoded blob's size and object URL (the download target).
  size: S.NullOr(S.Number),
  url: S.NullOr(S.String),
  // Snapshot or encode failure reason, shown in the status line.
  error: S.NullOr(S.String),
  // True after a successful download, until the next settings change.
  downloaded: S.Boolean,
})
export type Model = typeof Model.Type

export const init = (config: { readonly id: string; readonly fileStem: string }): Model => ({
  fileStem: config.fileStem,
  dialog: Dialog.init({ id: config.id }),
  settings: defaultExportSettings(),
  ready: false,
  encoding: false,
  size: null,
  url: null,
  error: null,
  downloaded: false,
})
