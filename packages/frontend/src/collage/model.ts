import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'
import { Collage, EditSummary, StoreError } from '@lutra/store'
import * as ExportDialog from '../export-dialog'

/**
 * The Collage Submodel's model (docs/adr/0009, 0030): the loaded collage as
 * AsyncData, the preview thumbnails for its tiles, a transient notice, and
 * the shared export-dialog machine (docs/adr/0031). There is no phase
 * machine and no draft — every arrangement mutation auto-saves immediately,
 * so the record is always the truth.
 */
/** The loaded collage, held as AsyncData (a missing id lands as a failure). */
export const LoadedCollage = AsyncData.Schema(Collage, StoreError)
/** The schema's typed constructors (`LoadedCollage.Success` etc.). */
export const loadedCollage = LoadedCollage

/**
 * Layout control bounds — the record stores plain numbers; this screen
 * clamps columns/gutter to its control ranges on every mutation edge.
 */
export const LAYOUT_BOUNDS = {
  minColumns: 2,
  maxColumns: 6,
  minGutter: 0,
  maxGutter: 32,
} as const

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const Model = S.Struct({
  collage: LoadedCollage.schema,
  /** Preview bytes per referenced Edit (its stored thumbnail). */
  thumbs: S.Array(EditSummary),
  // A transient banner (dangling references dropped on load, a failed save,
  // a failed export), null when clean.
  notice: S.NullOr(S.String),
  // The shared export-dialog machine (docs/adr/0031).
  exportDialog: ExportDialog.Model,
})
export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  collage: LoadedCollage.Idle(),
  thumbs: [],
  notice: null,
  exportDialog: ExportDialog.init({ id: 'collage-export-dialog', fileStem: 'lutra-collage' }),
})
