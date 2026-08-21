import { AsyncData } from 'foldkit'
import type { Command } from 'foldkit'
import type { CollageStore } from '@lutra/store'
import type { AppRoute } from '../route'
import type { Model } from './model'
import type { CollageMessage } from './message'
import { LoadCollage } from './command'

export type InformReturn = readonly [
  Model,
  readonly Command.Command<CollageMessage, never, CollageStore>[],
]

/**
 * Route changed into or out of the collage (docs/adr/0009). Arriving at a
 * collage re-fetches the record — reload and in-app navigation behave
 * identically, and auto-save means there is no unsaved local state to
 * protect. Leaving (or the bare `/collage` redirect) touches nothing.
 */
export const informRouteChanged = (model: Model, route: AppRoute): InformReturn =>
  route._tag === 'Collage' && route.collageId !== null
    ? [{ ...model, collage: AsyncData.Loading() }, [LoadCollage({ id: route.collageId })]]
    : [model, []]
