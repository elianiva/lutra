// Make the in-memory IndexedDB implementation (fake-indexeddb) the global
// `indexedDB` / `IDBKeyRange` for the store package's tests, so the real
// EditStoreIndexedDb backend runs against a real IndexedDB surface in Node.
import 'fake-indexeddb/auto'

// `IndexedDb.layerWindow` reads `window.indexedDB`; in the Node test
// environment there is no `window`, so alias it to `globalThis` (which
// fake-indexeddb/auto populated).
Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  configurable: true,
})
