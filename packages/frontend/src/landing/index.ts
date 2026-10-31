// The Landing Submodel (docs/adr/0015-landing): the site's front door at `/`.
// It owns the demo workbench state and renders the app's real components
// (range rows, tabs, badges, buttons) as the content. It needs no WebGPU, so
// the root renders it outside the capability gate.

export * as Model from './model'
export * as Message from './message'
export { update, type UpdateReturn } from './update'
export { view } from './view'
export { initialModel as init } from './model'
