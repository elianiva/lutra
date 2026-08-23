/// <reference lib="webworker" />
// The service worker (docs/adr/0007-offline). Deliberately dumb: the app shell is
// precached at install; the offline library (CONTEXT.md) is written by the
// page's offline fill — this script only ever reads it, and runtime-caches
// misses so real usage fills the cache ahead of the fill (cache-as-you-go).
//
// scripts/build-sw.ts injects the three tokens below and bundles this file
// into dist/sw.js: the precache manifest (the hashed build assets, known
// only after `vite build`), the shell cache name (a short hash of that
// manifest — every deploy installs into a fresh cache, so activate purges
// the previous deploy's whole shell, dead hashed assets included), and the
// shared LUT cache name (kept in sync with src/offline/cache.ts by
// construction).

declare const self: ServiceWorkerGlobalScope

// Injected by scripts/build-sw.ts (see the file header).
declare const __LUT_CACHE_NAME__: string
declare const __PRECACHE_MANIFEST__: readonly string[]
declare const __SHELL_CACHE_NAME__: string

const SHELL_CACHE = __SHELL_CACHE_NAME__
const LUT_CACHE = __LUT_CACHE_NAME__
const PRECACHE: readonly string[] = __PRECACHE_MANIFEST__

// Precache the app shell. The deploy-unique name means a deploy installs
// the new shell alongside the old; activate purges the previous version
// wholesale (old hashed assets can't leak across deploys).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(async (cache) => await cache.addAll(PRECACHE))
      .then(async () => await self.skipWaiting()),
  )
})

// Purge old shell caches only. The offline library cache (lutra-luts) is
// NEVER touched here: it survives SW swaps by construction, and the page's
// fill manages its lifecycle.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(
        async (keys) =>
          await Promise.all(
            keys
              .filter((key) => key.startsWith('lutra-shell-') && key !== SHELL_CACHE)
              .map(async (key) => await caches.delete(key)),
          ),
      )
      .then(async () => await self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  // Navigations: network-first so a deploy's fresh index.html (with its new
  // hashed asset references) lands on the next visit; offline reloads fall
  // back to the cached shell. The navigation response itself is NOT cached —
  // the shell cache holds the precached build's index, and mixing would
  // serve a torn shell (new index, old assets purged).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        async () => await caches.match('/index.html').then((hit) => hit ?? Response.error()),
      ),
    )
    return
  }

  // The offline library (catalog, cubes, thumbnails): cache-first. A miss is
  // fetched and mirrored — cache-as-you-go — so an applied LUT is cached
  // immediately, ahead of the fill's queue position.
  if (url.pathname.startsWith('/luts/')) {
    event.respondWith(
      caches.open(LUT_CACHE).then(
        async (cache) =>
          await cache.match(request).then(
            (hit) =>
              hit ??
              fetch(request).then((response) => {
                if (response.ok) {
                  void cache.put(request, response.clone())
                }
                return response
              }),
          ),
      ),
    )
    return
  }

  // Everything else same-origin (hashed assets, manifest, icons): cache-first
  // with put-on-miss as a safety net for anything the precache missed (a
  // lazily-loaded chunk the build manifest didn't list).
  event.respondWith(
    caches.open(SHELL_CACHE).then(
      async (cache) =>
        await cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((response) => {
              if (response.ok) {
                void cache.put(request, response.clone())
              }
              return response
            }),
        ),
    ),
  )
})
