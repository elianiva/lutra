import type { Command } from 'foldkit'
import type { GpuBackend } from '../gpu/backend'
import type { CanvasRef } from '../gpu/canvas-ref'
import type { LutStore } from '../luts/store'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import { initialModel, type Model } from './model'
import type { EditorMessage } from './message'
import { LoadCatalog, LoadExportSettings } from './command'

type Resource = GpuBackend | LutStore | CanvasRef | ImageEncoder | KeyValueStore

/**
 * The Editor Submodel's boot state, called by the root's `init` for the cold
 * load (docs/adr/0009). It seeds the editor and returns the boot Commands the
 * EditorRoute calls for: the LUT catalog fetch and the persisted export
 * settings restore (the LUT tool stays disabled until the catalog lands).
 *
 * In this restructure slice the editor has no storage-backed state yet — it
 * starts empty. When attached-edit loading lands (the save/save-as slice,
 * ADR 0008), `init` will also read the `editId` off the route and return a
 * `LoadEdit` here, like the Gallery's `init` fires `ListEdits` for its route.
 */
export type InitReturn = [
  Model,
  ReadonlyArray<Command.Command<EditorMessage, never, Resource>>,
]
export const init = (): InitReturn => [initialModel(), [LoadCatalog(), LoadExportSettings()]]
