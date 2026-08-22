import { Effect, Layer } from 'effect'
import type { Url } from 'foldkit'
import { Runtime } from 'foldkit'
import { overlay } from '@foldkit/devtools'
import { BrowserKeyValueStore } from '@effect/platform-browser'
import type { UrlRequest } from 'foldkit/navigation'
import { CollageStoreIndexedDb, EditStoreIndexedDb } from '@lutra/store'
import { ChangedRoute, Navigated, RootMessage } from './root/message'
import { Model } from './root/model'
import { init } from './root/init'
import { update } from './root/update'
import { view } from './root/view'
import { subscriptions } from './root/subscriptions'
import { parseRoute } from './route'
import { GpuBackendLive } from './gpu/backend'
import { detectWebGpu } from './gpu/capability'
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
 *
 * The WebGPU capability is probed once at boot (async — `requestAdapter`)
 * and fed into `init` so the Model can carry it. The root view then gates the
 * whole editor on it: no WebGPU → a remediation screen instead of a crash
 * (docs/adr/0029). The GPU backend itself is acquired lazily on first use, so
 * the resource Layer builds at boot even on a GPU-less device.
 */
const capability = await Effect.runPromise(detectWebGpu)

export const application = Runtime.makeApplication({
  Model,
  container: document.querySelector('#root'),
  devTools: {
    Message: RootMessage,
    overlay,
    // High-frequency UI gestures would flood the DevTools history and
    // retain a full RootModel snapshot per entry (linear memory with
    // Uint8Array/ImageBitmap inside). Exclude them so history stays
    // useful and time-travel replay stays cheap — ADR 0034.
    excludeFromHistory: [
      'ScaledCanvas',
      'CurvePointDragged',
      'ChangedSplitPosition',
      'PreviewedLut',
      'PanMoved',
      'WheelZoomed',
      'MovedLayerReorder',
    ],
    maxEntries: 60,
    keyframeInterval: 12,
  },
  slow: {
    // Keep the default View budget (16ms) but allow Patch a little more
    // headroom during heavy gallery grids; report every over-budget phase
    // via the default console.warn so the 2.2s spike from ADR 0034 never
    // goes unnoticed. Production can switch to { show: 'Development' }
    // or supply onSlow to forward to analytics.
    thresholdOverrides: { View: 16, Patch: 12 },
  },
  init: (url: Url.Url) => init(capability, url),
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
                // The local IndexedDB backends (docs/adr/0007, 0008, 0030).
                Layer.merge(EditStoreIndexedDb, CollageStoreIndexedDb),
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
