// The Collage Submodel (docs/adr/0006-frontend-architecture, docs/adr/0009-collage): a screen owning one
// saved Collage — its fixed-grid preview, layout controls, and export —
// behind a `GotCollageMessage` boundary at the root. The root embeds `view`,
// delegates `GotCollageMessage` to `update`, cold-loads via `init(route)`
// (fires `LoadCollage` when a collage is the boot route), and notifies route
// changes via `informRouteChanged`.
//
// Namespaced exports mirror the gallery's submodel packaging so the root
// reads `Collage.Model.Model`/`Collage.Message.Message` the canonical way.

export * as Model from './model'
export * as Message from './message'
export { update, type UpdateReturn } from './update'
export { init } from './init'
export { informRouteChanged } from './inform-route-changed'
export { view } from './view'
