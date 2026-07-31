// The Gallery Submodel (docs/adr/0009): a thin screen owning the grid of
// saved Edit summaries and the open/delete actions, behind a
// `GotGalleryMessage` boundary at the root. The root embeds `view`, delegates
// `GotGalleryMessage` to `update`, cold-loads via `init(route)` (fires
// `ListEdits` when the gallery is the boot route), and notifies route changes
// via `informRouteChanged`.
//
// Namespaced exports mirror the typing-game's submodel packaging so the root
// reads `Gallery.Model.Model`/`Gallery.Message.Message` the canonical way.

export * as Model from './model'
export * as Message from './message'
export { update, type UpdateReturn } from './update'
export { init } from './init'
export { informRouteChanged } from './inform-route-changed'
export { view } from './view'
