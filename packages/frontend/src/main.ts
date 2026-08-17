import { Layer } from 'effect'
import type { Url } from 'foldkit'
import { Runtime } from 'foldkit'
import { overlay } from '@foldkit/devtools'
import { BrowserKeyValueStore } from '@effect/platform-browser'
import type { UrlRequest } from 'foldkit/navigation'
import { EditStoreIndexedDb } from '@lutra/store'
import { ChangedRoute, Navigated, RootMessage } from './root/message'
import { Model } from './root/model'
import { init } from './root/init'
import { update } from './root/update'
import { view } from './root/view'
import { subscriptions } from './root/subscriptions'
import { parseRoute } from './route'
import { GpuBackendLive } from './gpu/backend'
import { CanvasRefLive } from './gpu/canvas-ref'
import { LutStoreLive } from './luts/store'
import { ImageEncoderWorkerLive } from './encode/worker-layer'
import { LutThumbnailerLive } from './thumbs/worker-layer'
import { OfflineFillLive } from './offline/fill'

/**
 * The root application (docs/adr/0009): a root Submodel orchestrating the
 * Gallery and Editor submodels behind `Got*Message` boundaries. `init` parses
 * the boot URL and cold-loads the active submodel; `ChangedRoute` hands route
 * changes to the active submodel via `informRouteChanged`; `Overlay` surfaces
 * the root's message universe to DevTools.
 */
export const application = Runtime.makeApplication({
  Model,
  container: document.querySelector('#root'),
  devTools: { Message: RootMessage, overlay },
  init: (url: Url.Url) => init(url),
  resources: Layer.merge(
    GpuBackendLive,
    Layer.merge(
      OfflineFillLive,
      Layer.merge(
        LutStoreLive,
        Layer.merge(
          CanvasRefLive,
          Layer.merge(
            ImageEncoderWorkerLive,
            Layer.merge(
              LutThumbnailerLive,
              Layer.merge(
                BrowserKeyValueStore.layerLocalStorage,
                // The local IndexedDB EditStore backend (docs/adr/0007, 0008).
                EditStoreIndexedDb,
              ),
            ),
          ),
        ),
      ),
    ),
  ),
  routing: {
    onUrlChange: (url: Url.Url) => ChangedRoute({ route: parseRoute(url) }),
    onUrlRequest: (request: UrlRequest) => Navigated({ request }),
  },
  subscriptions,
  update,
  view,
})
