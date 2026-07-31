// The Editor Submodel (docs/adr/0009): owns the editor's Model, Message
// union, update, Commands, phase machine, and view behind a `GotEditorMessage`
// boundary at the root. The root embeds `view`, delegates `GotEditorMessage`
// to `update`, cold-loads via `init(route)`, and notifies route changes via
// `informRouteChanged`.
//
// Namespaced exports (`* as Model`, `* as Message`) mirror the typing-game's
// submodel packaging so the root reads `Editor.Model.Model` the same canonical
// way.

export * as Model from './model'
export * as Message from './message'
export { update, type UpdateReturn } from './update'
export { init } from './init'
export { informRouteChanged } from './inform-route-changed'
export { view } from './view'
