import { Layer } from 'effect'
import { Runtime, Url } from 'foldkit'
import { overlay } from '@foldkit/devtools'
import { BrowserKeyValueStore } from '@effect/platform-browser'
import type { UrlRequest } from 'foldkit/navigation'
import { ChangedRoute, Navigated, AppMessage } from './app/message'
import { Model, initialModel } from './app/model'
import { update } from './app/update'
import { view } from './view'
import { parseRoute, EditorRoute } from './route'
import { GpuBackendLive } from './gpu/backend'
import { CanvasRefLive } from './gpu/canvas-ref'
import { LutStoreLive } from './luts/store'
import { ImageEncoderWorkerLive } from './encode/worker-layer'
import { LoadCatalog, LoadExportSettings } from './app/command'

export const application = Runtime.makeApplication({
  Model,
  init: (url: Url.Url) => {
    const parsed = parseRoute(url)
    // Only EditorRoute is handled in v1; everything else falls back to editor.
    const route = parsed._tag === 'EditorRoute' ? parsed : EditorRoute()
    // Fetch the LUT library catalog and restore the persisted export
    // settings once at startup (the LUT tool stays disabled until the
    // catalog lands; export settings default until they load).
    return [
      { ...initialModel(), route },
      [LoadCatalog(), LoadExportSettings()],
    ] as const
  },
  update,
  view,
  container: document.getElementById('root'),
  resources: Layer.merge(
    GpuBackendLive,
    Layer.merge(
      LutStoreLive,
      Layer.merge(CanvasRefLive, Layer.merge(ImageEncoderWorkerLive, BrowserKeyValueStore.layerLocalStorage)),
    ),
  ),
  routing: {
    onUrlRequest: (request: UrlRequest) => Navigated({ request }),
    onUrlChange: (url: Url.Url) => {
      const parsed = parseRoute(url)
      const route = parsed._tag === 'EditorRoute' ? parsed : EditorRoute()
      return ChangedRoute({ route })
    },
  },
  devTools: { Message: AppMessage, overlay },
})
