import { Update } from 'foldkit'
import type { EditStore, CollageStore } from '@lutra/store'
import type { AppRoute } from '../route'
import { initialModel } from './model'
import type { Model } from './model'
import type { GalleryMessage } from './message'
import { ListCollages, ListEdits } from './command'

/**
 * The Gallery Submodel's boot state, called by the root's `init` for the
 * cold load (docs/adr/0006-frontend-architecture). It seeds the gallery and returns the boot
 * Command the GalleryRoute calls for — a `ListEdits` fetch when the initial
 * URL is the gallery with no summary in flight yet.
 *
 * Both Submodels are initialized on every cold load (they hold persistent
 * cross-route state); only the active route's commands fire here.
 */
type Resource = EditStore | CollageStore

export type InitReturn = Update.Return<Model, GalleryMessage, Resource>
export const init = (route: AppRoute): InitReturn => {
  const commands = route._tag === 'Gallery' ? [ListEdits(), ListCollages()] : []
  return { model: initialModel(), commands }
}
