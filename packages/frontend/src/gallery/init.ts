import { Command } from 'foldkit'
import { EditStore } from '@lutra/store'
import type { AppRoute } from '../route'
import { initialModel, type Model } from './model'
import type { GalleryMessage } from './message'
import { ListEdits } from './command'

/**
 * The Gallery Submodel's boot state, called by the root's `init` for the
 * cold load (docs/adr/0009). It seeds the gallery and returns the boot
 * Command the GalleryRoute calls for — a `ListEdits` fetch when the initial
 * URL is the gallery with no summary in flight yet.
 *
 * Both Submodels are initialized on every cold load (they hold persistent
 * cross-route state); only the active route's commands fire here.
 */
export type InitReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<GalleryMessage, never, EditStore>>,
]
export const init = (route: AppRoute): InitReturn => {
  const commands = route._tag === 'Gallery' ? [ListEdits()] : []
  return [initialModel(), commands]
}
