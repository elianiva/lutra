// The Tools Submodel (docs/adr/0014-tools): batch resize/compress and the
// collage maker, behind a `GotToolsMessage` boundary at the root. It holds its
// own state across route changes, so a half-built batch survives a visit to
// the gallery.

import type { Update } from 'foldkit'
import { readMode } from '../theme'
import { initialModel } from './model'
import type { Model } from './model'
import type { Message } from './message'
import type { ImageWorkers } from './pipeline/pool'

export * as Model from './model'
export * as Message from './message'
export { update } from './update'
export { view } from './view'

export const init = (): Model => initialModel(readMode())

/** The parent's hook for a route change that lands on Tools: the gallery or
 *  editor may have switched the appearance while Tools was away. */
export const informRouteChanged = (model: Model): Update.Return<Model, Message, ImageWorkers> => ({
  model: { ...model, mode: readMode() },
})
