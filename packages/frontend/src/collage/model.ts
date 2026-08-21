import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'
import { Collage, StoreError } from '@lutra/store'

/**
 * The Collage Submodel's model: the loaded collage record as AsyncData plus
 * a transient notice. Like the gallery, there is no phase machine — the
 * lifecycle is exactly the AsyncData of the load (docs/adr/0009), and the
 * arrangement itself is plain data (the record auto-saves; there is no draft).
 */
/** The loaded collage, held as AsyncData (a missing id lands as a failure). */
export const LoadedCollage = AsyncData.Schema(Collage, StoreError)
/** The schema's typed constructors (`LoadedCollage.Success` etc.). */
export const loadedCollage = LoadedCollage

export const Model = S.Struct({
  collage: LoadedCollage.schema,
  // A transient banner (dangling references dropped on load, a failed save),
  // null when clean.
  notice: S.NullOr(S.String),
})
export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  collage: LoadedCollage.Idle(),
  notice: null,
})
