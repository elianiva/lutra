import { Schema as S } from 'effect'
import { AppRoute } from '../route'
import { Model as GalleryModel } from '../gallery/model'
import { Model as EditorModel } from '../editor/model'
import { Offline } from '../offline/model'
import { WebGpuCapability } from '../gpu/capability'

/**
 * The root's Model (docs/adr/0009): the current route plus the two Submodel
 * slices it orchestrates. The root never reaches into the child slices
 * directly — it holds them, and every change flows through the child's
 * `update` via a `Got*Message` (or an `init`/`informRouteChanged` helper).
 * The `offline` slice is the one root-owned domain: it spans both Submodels
 * (the progress card floats bottom-right on the main menu, the per-LUT
 * download states reach the editor's LUT bar through the root's delegation).
 */
export const Model = S.Struct({
  editor: EditorModel,
  gallery: GalleryModel,
  offline: Offline,
  route: AppRoute,
  webgpu: WebGpuCapability,
})
export type Model = typeof Model.Type
