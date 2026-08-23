import { Effect, Layer } from 'effect'
import type { Url } from 'foldkit'
import { Runtime } from 'foldkit'
import { BrowserKeyValueStore } from '@effect/platform-browser'
import type { UrlRequest } from 'foldkit/navigation'
import { CollageStoreIndexedDb, EditStoreIndexedDb } from '@lutra/store'
import { AppMessage, RootMessage } from './root/message'
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
 * The root application (docs/adr/0006-frontend-architecture): a root Submodel orchestrating the
 * Gallery and Editor submodels behind `Got*Message` boundaries. `init` parses
 * the boot URL and cold-loads the active submodel; `ChangedRoute` hands route
 * changes to the active submodel via `informRouteChanged`; `Overlay` surfaces
 * the root's message universe to DevTools.
 *
 * The WebGPU capability is probed once at boot (async — `requestAdapter`)
 * and fed into `init` so the Model can carry it. The root view then gates the
 * whole editor on it: no WebGPU → a remediation screen instead of a crash
 * (docs/adr/0001-rendering-engine). The GPU backend itself is acquired lazily on first use, so
 * the resource Layer builds at boot even on a GPU-less device.
 */
const capability = await Effect.runPromise(detectWebGpu)

export const application = Runtime.makeApplication({
  Model,
  container: document.querySelector('#root'),
  devTools: {
    Message: AppMessage,
    // The overlay itself is injected by @foldkit/vite-plugin before app
    // startup (@foldkit/devtools is a devDependency, so production bundles
    // carry no overlay code).
    // High-frequency UI gestures would flood the DevTools history and
    // retain a full RootModel snapshot per entry (linear memory with
    // Uint8Array/ImageBitmap inside). Exclude them so history stays
    // useful and time-travel replay stays cheap — ADR 0006.
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
    // via the default console.warn so the 2.2s spike from ADR 0006 never
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
                // The local IndexedDB backends (docs/adr/0005-storage, docs/adr/0009-collage).
                Layer.merge(EditStoreIndexedDb, CollageStoreIndexedDb),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
  routing: {
    onUrlChange: (url: Url.Url) => RootMessage.ChangedRoute({ route: parseRoute(url) }),
    onUrlRequest: (request: UrlRequest) => RootMessage.Navigated({ request }),
  },
  subscriptions,
  update,
  view,
})
