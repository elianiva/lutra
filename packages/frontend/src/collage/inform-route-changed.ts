import { AsyncData, Command, Update } from 'foldkit'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { CollageStore, EditStore } from '@lutra/store'
import * as ExportDialog from '../export-dialog'
import type { AppRoute } from '../route'
import type { Model } from './model'
import { CollageMessage } from './message'
import { LoadCollage } from './command'

type Resource = KeyValueStore | CollageStore | EditStore

export type InformReturn = Update.Return<Model, CollageMessage, Resource>

const toSelf = (message: ExportDialog.Message): CollageMessage =>
  CollageMessage.GotCollageExportDialogMessage({ message })

const settings = [Command.mapMessage(ExportDialog.LoadExportSettings(), toSelf)]

/**
 * Route changed into or out of the collage (docs/adr/0006-frontend-architecture). Arriving at a
 * collage re-fetches the record — reload and in-app navigation behave
 * identically, and auto-save means there is no unsaved local state to
 * protect — and restores the persisted export settings (shared with the
 * editor's dialog, docs/adr/0004-export). Leaving (or the bare `/collage`
 * redirect) only restores the settings.
 */
export const informRouteChanged = (model: Model, route: AppRoute): InformReturn =>
  route._tag === 'Collage' && route.collageId !== null
    ? {
        model: { ...model, collage: AsyncData.Loading() },
        commands: [LoadCollage({ id: route.collageId }), ...settings],
      }
    : { model, commands: settings }
