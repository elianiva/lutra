import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { Collage, EditSummary, StoreError } from '@lutra/store'
import { ExportSettings, defaultExportSettings } from '@lutra/engine'

/**
 * The Collage Submodel's model (docs/adr/0009, 0030): the loaded collage as
 * AsyncData, the preview thumbnails for its tiles, a transient notice, and
 * the export-dialog slice. There is no phase machine and no draft — every
 * arrangement mutation auto-saves immediately, so the record is always the
 * truth.
 */
/** The loaded collage, held as AsyncData (a missing id lands as a failure). */
export const LoadedCollage = AsyncData.Schema(Collage, StoreError)
/** The schema's typed constructors (`LoadedCollage.Success` etc.). */
export const loadedCollage = LoadedCollage

export const Model = S.Struct({
  collage: LoadedCollage.schema,
  /** Preview bytes per referenced Edit (its stored thumbnail). */
  thumbs: S.Array(EditSummary),
  // A transient banner (dangling references dropped on load, a failed save,
  // a failed export), null when clean.
  notice: S.NullOr(S.String),

  // ---- export dialog (mirrors the editor's flow, docs/adr/0031) ----
  exportDialog: Dialog.Model,
  /** Persisted format/quality/scale choice — shared key with the editor. */
  exportSettings: ExportSettings,
  /** True while a composed frame is cached for the open dialog. */
  exportReady: S.Boolean,
  exportEncoding: S.Boolean,
  exportSize: S.NullOr(S.Number),
  exportUrl: S.NullOr(S.String),
  exportError: S.NullOr(S.String),
  exportDownloaded: S.Boolean,
})
export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  collage: LoadedCollage.Idle(),
  thumbs: [],
  notice: null,
  exportDialog: Dialog.init({ id: 'collage-export-dialog' }),
  exportSettings: defaultExportSettings(),
  exportEncoding: false,
  exportSize: null,
  exportUrl: null,
  exportError: null,
  exportDownloaded: false,
  exportReady: false,
})
