import type { Command } from 'foldkit'
import type { GpuBackend } from '../gpu/backend'
import type { CanvasRef } from '../gpu/canvas-ref'
import type { LutStore } from '../luts/store'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import { EditStore } from '@lutra/store'
import type { EditorMessage } from './message'
import type { Model } from './model'
import type { AppRoute } from '../route'
import { LoadCatalog, LoadEdit, LoadExportSettings } from './command'

type Resource = GpuBackend | LutStore | CanvasRef | ImageEncoder | KeyValueStore | EditStore

/**
 * The parent's hook for a route change that resolves to the Editor. Per the
 * `inform*` convention (docs/adr/0009, informingSubmodels.md): the root owns
 * the route; the Editor derives its state from it. The root calls this
 * instead of dispatching an Editor Message.
 *
 * Fire the one-time startup loads that are still missing (catalog, export
 * settings), and re-load the attached Edit when the route carries an
 * `editId` — arriving from the gallery after an open-photo flow (or from a
 * reload) hydrates the editor from the stored Edit. Arriving without an id
 * (gallery route) leaves the editor as-is; it is persistent cross-route
 * state per ADR 0009.
 */
export type RouteChangedReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<EditorMessage, never, Resource>>,
]
export const informRouteChanged = (model: Model, route: AppRoute): RouteChangedReturn => {
  const boot = [LoadCatalog(), LoadExportSettings()]
  const commands =
    route._tag === 'Editor' ? [LoadEdit({ id: route.editId }), ...boot] : boot
  return [model, commands]
}
