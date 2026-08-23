import type { Command } from 'foldkit'
import { Command as CommandModule } from 'foldkit'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { CollageStore, EditStore } from '@lutra/store'
import * as ExportDialog from '../export-dialog'
import type { AppRoute } from '../route'
import { initialModel } from './model'
import type { Model } from './model'
import { CollageMessage } from './message'
import { LoadCollage } from './command'

/**
 * The Collage Submodel's boot state, called by the root's `init` for the
 * cold load (docs/adr/0006-frontend-architecture). Seeds the collage slice and returns the boot
 * Command the CollageRoute arm calls for — a `LoadCollage` fetch when the
 * initial URL addresses a collage. The bare `/collage` form carries a null
 * id and is redirected home by the root, so it fires nothing. The shared
 * export-dialog's persisted settings restore on every boot (docs/adr/0004-export).
 *
 * All Submodels are initialized on every cold load (they hold persistent
 * cross-route state); only the active route's commands fire here.
 */
type Resource = KeyValueStore | CollageStore | EditStore

const toSelf = (message: ExportDialog.Message): CollageMessage =>
  CollageMessage.GotCollageExportDialogMessage({ message })

const settings = [CommandModule.mapMessage(ExportDialog.LoadExportSettings(), toSelf)]

export type InitReturn = readonly [
  Model,
  readonly Command.Command<CollageMessage, never, Resource>[],
]
export const init = (route: AppRoute): InitReturn => {
  const commands =
    route._tag === 'Collage' && route.collageId !== null
      ? [LoadCollage({ id: route.collageId }), ...settings]
      : settings
  return [initialModel(), commands]
}
