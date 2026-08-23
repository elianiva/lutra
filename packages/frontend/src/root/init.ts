import type { Url } from 'foldkit'
import { Command } from 'foldkit'
import { Match, Schema as S } from 'effect'
import type { GpuBackend } from '../gpu/backend'
import type { CanvasRef } from '../gpu/canvas-ref'
import type { LutStore } from '../luts/store'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { EditStore, CollageStore } from '@lutra/store'
import { AppMessage, RootMessage } from './message'
import type { Model } from './model'
import { GalleryRoute, EditorRoute, CollageRoute, parseRoute } from '../route'
import * as Gallery from '../gallery'
import * as Editor from '../editor'
import * as Collage from '../collage'
import type { LutThumbnailer } from '../thumbs/worker-layer'
import type { WebGpuCapability } from '../gpu/capability'
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
  | CollageStore
  | LutThumbnailer
  | OfflineFill

export type InitReturn = readonly [Model, readonly Command.Command<AppMessage, never, Resource>[]]

/**
 * The root's cold-load `init` (docs/adr/0009, routing-and-navigation). Parses
 * the boot URL into a route, seeds BOTH Submodels (they hold persistent
 * cross-route state — a user can navigate between them without a reload), and
 * fires only the active route's boot Commands:
 *
 *   Gallery → `Gallery.init` (fires `ListEdits` so the grid populates)
 *   Editor  → `Editor.init`  (fires the LUT catalog + export-settings loads)
 *   Collage → `Collage.init` (fires `LoadCollage` when a collage is the boot URL)
 *   NotFound → none
 */
export const init = (capability: WebGpuCapability, url: Url.Url): InitReturn => {
  const route = parseRoute(url)

  const [gallery, galleryCommands] = Gallery.init(route)
  const [editor, editorCommands] = Editor.init(route)
  const [collage, collageCommands] = Collage.init(route)
  const offline = initialOffline()

  const commands = Match.value(route).pipe(
    Match.withReturnType<readonly Command.Command<AppMessage, never, Resource>[]>(),
    Match.when(S.is(GalleryRoute), () =>
      Command.mapMessages(galleryCommands, (message) => RootMessage.GotGalleryMessage({ message })),
    ),
    Match.when(S.is(EditorRoute), () =>
      Command.mapMessages(editorCommands, (message) => RootMessage.GotEditorMessage({ message })),
    ),
    Match.when(S.is(CollageRoute), () =>
      Command.mapMessages(collageCommands, (message) => RootMessage.GotCollageMessage({ message })),
    ),
    Match.orElse(() => []),
  )

  return [
    {
      editor,
      gallery,
      collage,
      offline,
      route,
      webgpu: capability,
    },
    // The offline fill's boot auto-start (docs/adr/0015): unless the device
    // asked for reduced data usage — then the card's manual start button
    // is the only path in, and `start` stays idempotent for both. The
    // persist() request rides along ungated (a bonus, not a precondition).
    offline.saveData ? commands : [...commands, StartOfflineFill({ requirePersist: false })],
  ]
}
