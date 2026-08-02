import { Command, Url } from 'foldkit'
import { GpuBackend } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import { LutStore } from '../luts/store'
import { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import { EditStore } from '@lutra/store'
import type { RootMessage } from './message'
import { GotGalleryMessage, GotEditorMessage } from './message'
import type { Model } from './model'
import * as Gallery from '../gallery'
import * as Editor from '../editor'
import { parseRoute } from '../route'

type Resource =
  | GpuBackend
  | LutStore
  | CanvasRef
  | ImageEncoder
  | KeyValueStore
  | EditStore

export type InitReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<RootMessage, never, Resource>>,
]

/**
 * The root's cold-load `init` (docs/adr/0009, routing-and-navigation). Parses
 * the boot URL into a route, seeds BOTH Submodels (they hold persistent
 * cross-route state — a user can navigate between them without a reload), and
 * fires only the active route's boot Commands:
 *
 *   Gallery → `Gallery.init` (fires `ListEdits` so the grid populates)
 *   Editor  → `Editor.init`  (fires the LUT catalog + export-settings loads)
 *   NotFound → neither
 */
export const init = (url: Url.Url): InitReturn => {
  const route = parseRoute(url)

  const [gallery, galleryCommands] = Gallery.init(route)
  const [editor, editorCommands] = Editor.init(route)

  const commands = (() => {
    switch (route._tag) {
      case 'Gallery':
        return Command.mapMessages(galleryCommands, (message) => GotGalleryMessage({ message }))
      case 'Editor':
        return Command.mapMessages(editorCommands, (message) => GotEditorMessage({ message }))
      case 'NotFound':
        return [] satisfies ReadonlyArray<Command.Command<RootMessage, never, Resource>>
    }
  })()

  return [
    {
      route,
      gallery,
      editor,
    },
    commands,
  ]
}
