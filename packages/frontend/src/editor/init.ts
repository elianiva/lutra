import type { Command } from 'foldkit'
import type { GpuBackend } from '../gpu/backend'
import type { CanvasRef } from '../gpu/canvas-ref'
import type { LutStore } from '../luts/store'
import type { LutThumbnailer } from '../thumbs/worker-layer'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { EditStore } from '@lutra/store'
import { initialModel } from './model'
import type { Model } from './model'
import type { EditorMessage } from './message'
import type { AppRoute } from '../route'
import { LoadCatalog, LoadEdit, LoadExportSettings, LoadLutRecents } from './command'

type Resource =
  | GpuBackend
  | LutStore
  | CanvasRef
  | ImageEncoder
  | KeyValueStore
  | EditStore
  | LutThumbnailer

/**
 * The Editor Submodel's boot state, called by the root's `init` for the cold
 * load (docs/adr/0009). It seeds the editor and returns the boot Commands the
 * EditorRoute calls for: the LUT catalog fetch, the persisted export settings
 * and LUT recents restore (the LUT tool stays disabled until the catalog
 * lands), plus — when the route attaches an Edit (`/edit/:id`) — the
 * `LoadEdit` that hydrates the editor from the gallery's open-photo flow.
 */
export type InitReturn = [Model, readonly Command.Command<EditorMessage, never, Resource>[]]
export const init = (route: AppRoute): InitReturn => {
  const boot = [LoadCatalog(), LoadExportSettings(), LoadLutRecents()]
  const commands = route._tag === 'Editor' ? [LoadEdit({ id: route.editId }), ...boot] : boot
  return [initialModel(), commands]
}
