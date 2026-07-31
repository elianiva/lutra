import type { Command } from 'foldkit'
import type { GpuBackend } from '../gpu/backend'
import type { CanvasRef } from '../gpu/canvas-ref'
import type { LutStore } from '../luts/store'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { EditorMessage } from './message'
import type { Model } from './model'
import type { AppRoute } from '../route'
import { LoadCatalog, LoadExportSettings } from './command'

type Resource = GpuBackend | LutStore | CanvasRef | ImageEncoder | KeyValueStore

/**
 * The parent's hook for a route change that resolves to the Editor. Per the
 * `inform*` convention (docs/adr/0009, informingSubmodels.md): the root owns
 * the route; the Editor derives its state from it. The root calls this
 * instead of dispatching an Editor Message.
 *
 * Fire the one-time startup loads that are still missing (catalog, export
 * settings), so arriving at the editor from the gallery builds them if a
 * cold start never reached the editor. In this foundation slice there is no
 * per-edit state to re-derive; when attached-edit loading lands, this will
 * re-load the Edit when the `editId` in the URL changes.
 */
export type RouteChangedReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<EditorMessage, never, Resource>>,
]
export const informRouteChanged = (model: Model, _route: AppRoute): RouteChangedReturn => [
  model,
  [LoadCatalog(), LoadExportSettings()],
]
