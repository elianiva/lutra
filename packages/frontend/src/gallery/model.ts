import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'
import { EditSummary, StoreError, EditIdSchema } from '@lutra/store'

/**
 * The Gallery Submodel's model (docs/adr/0009): the list of saved Edits
 * (their summaries) as AsyncData, plus the current GalleryPage it owns.
 *
 * There is no discrete "phases" machine here the way the Editor has one —
 * the gallery's lifecycle is exactly the AsyncData of the grid (idle →
 * loading → loaded / failed), plus the per-route field below.
 */
export const GalleryRoute = S.Struct({})

/** The summaries `list()` returns, held as AsyncData (source bytes excluded). */
export const EditList = AsyncData.Schema(S.Array(EditSummary), StoreError)
/** The schema's typed constructors (`EditList.Success` etc.). */
export const editList = EditList

export const Model = S.Struct({
  grid: EditList.schema,
  // A transient banner message (e.g. a failed photo create), null when clean.
  notice: S.NullOr(S.String),
  // The current collage selection: Edit ids picked via the per-tile select
  // controls. Empty means nothing is selected; "Create collage" enables at two.
  selection: S.Array(EditIdSchema),
})
export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  grid: EditList.Idle(),
  notice: null,
  selection: [],
})
