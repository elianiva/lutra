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
import type { LutThumbnailer } from '../thumbs/worker-layer'
import { initialOffline } from '../offline/model'
import { StartOfflineFill } from './offline-command'
import type { OfflineFill } from '../offline/fill'

type Resource =
  | GpuBackend
  | LutStore
  | CanvasRef
  | ImageEncoder
  | KeyValueStore
  | EditStore
  | LutThumbnailer
  | OfflineFill

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
  const offline = initialOffline()

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
      offline,
    },
    // The offline fill's boot auto-start (docs/adr/0015): unless the device
    // asked for reduced data usage — then the strip's manual start button
    // is the only path in, and `start` stays idempotent for both. The
    // persist() request rides along ungated (a bonus, not a precondition).
    offline.saveData ? commands : [...commands, StartOfflineFill({ requirePersist: false })],
  ]
}
