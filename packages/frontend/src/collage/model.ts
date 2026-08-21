import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'
import { Collage, EditSummary, StoreError } from '@lutra/store'

/**
 * The Collage Submodel's model (docs/adr/0009, 0030): the loaded collage as
 * AsyncData, the preview thumbnails for its tiles, and a transient notice.
 * There is no phase machine and no draft — every arrangement mutation
 * auto-saves immediately, so the record is always the truth.
 */
/** The loaded collage, held as AsyncData (a missing id lands as a failure). */
export const LoadedCollage = AsyncData.Schema(Collage, StoreError)
/** The schema's typed constructors (`LoadedCollage.Success` etc.). */
export const loadedCollage = LoadedCollage

export const Model = S.Struct({
  collage: LoadedCollage.schema,
  /** Preview bytes per referenced Edit (its stored thumbnail). */
  thumbs: S.Array(EditSummary),
  // A transient banner (dangling references dropped on load, a failed save),
  // null when clean.
  notice: S.NullOr(S.String),
})
export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  collage: LoadedCollage.Idle(),
  thumbs: [],
  notice: null,
})
