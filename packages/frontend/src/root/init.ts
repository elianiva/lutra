import { Command, Url } from 'foldkit'
import { Match, Schema as S } from 'effect'
import { GpuBackend } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import { LutStore } from '../luts/store'
import { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import { EditStore } from '@lutra/store'
import type { RootMessage } from './message'
import { GotGalleryMessage, GotEditorMessage } from './message'
import type { Model } from './model'
import { GalleryRoute, EditorRoute, parseRoute } from '../route'
import * as Gallery from '../gallery'
import * as Editor from '../editor'

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

  const commands = Match.value(route).pipe(
    Match.withReturnType<ReadonlyArray<Command.Command<RootMessage, never, Resource>>>(),
    Match.when(S.is(GalleryRoute), () =>
      Command.mapMessages(galleryCommands, (message) => GotGalleryMessage({ message })),
    ),
    Match.when(S.is(EditorRoute), () =>
      Command.mapMessages(editorCommands, (message) => GotEditorMessage({ message })),
    ),
    Match.orElse(() => []),
  )

  return [
    {
      route,
      gallery,
      editor,
    },
    commands,
  ]
}
