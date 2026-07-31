import { Schema as S } from 'effect'
import { AppRoute } from '../route'
import { Model as GalleryModel } from '../gallery/model'
import { Model as EditorModel } from '../editor/model'

/**
 * The root's Model (docs/adr/0009): the current route plus the two Submodel
 * slices it orchestrates. The root never reaches into the child slices
 * directly — it holds them, and every change flows through the child's
 * `update` via a `Got*Message` (or an `init`/`informRouteChanged` helper).
 */
export const Model = S.Struct({
  route: AppRoute,
  gallery: GalleryModel,
  editor: EditorModel,
})
export type Model = typeof Model.Type
