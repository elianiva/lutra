import type { Command } from 'foldkit'
import type { EditStore, CollageStore } from '@lutra/store'
import type { AppRoute } from '../route'
import type { Model } from './model'
import type { GalleryMessage } from './message'
import { ListCollages, ListEdits } from './command'

/**
 * The parent's hook for a route change that resolves to the Gallery. Per the
 * `inform*` convention (docs/adr/0006-frontend-architecture, informingSubmodels.md): the root owns
 * the route; the gallery derives its grid from it. The root calls this on
 * every `ChangedRoute` that lands on the Gallery, which re-fetches the grid so
 * returning from the editor reflects any edits the editor just saved.
 */
type Resource = EditStore | CollageStore

export type RouteChangedReturn = readonly [
  Model,
  readonly Command.Command<GalleryMessage, never, Resource>[],
]
export const informRouteChanged = (model: Model, _route: AppRoute): RouteChangedReturn => [
  model,
  [ListEdits(), ListCollages()],
]
