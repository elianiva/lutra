/// <reference lib="webworker" />
// The service worker (docs/adr/0007-offline). Deliberately dumb: the app shell is
//
// construction).

declare const self: ServiceWorkerGlobalScope

declare const __LUT_CACHE_NAME__: string
declare const __PRECACHE_MANIFEST__: readonly string[]
declare const __SHELL_CACHE_NAME__: string

const SHELL_CACHE = __SHELL_CACHE_NAME__
const LUT_CACHE = __LUT_CACHE_NAME__
const PRECACHE: readonly string[] = __PRECACHE_MANIFEST__

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(async (cache: Cache) => await cache.addAll(PRECACHE))
      .then(async () => await self.skipWaiting()),
  )
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then(
        async (keys: string[]) =>
          await Promise.all(
            keys
              .filter((key: string) => key.startsWith('lutra-shell-') && key !== SHELL_CACHE)
              .map(async (key: string) => await caches.delete(key)),
          ),
      )
      .then(async () => await self.clients.claim()),
  )
})

self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        async () => await caches.match('/index.html').then((hit: Response | undefined) => hit ?? Response.error()),
      ),
    )
    return
  }

  if (url.pathname.startsWith('/luts/')) {
    event.respondWith(
      caches.open(LUT_CACHE).then(
        async (cache: Cache) =>
          await cache.match(request).then(
            (hit: Response | undefined) =>
              hit ??
              fetch(request).then((response: Response) => {
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

  event.respondWith(
    caches.open(SHELL_CACHE).then(
      async (cache: Cache) =>
        await cache.match(request).then(
          (hit: Response | undefined) =>
            hit ??
            fetch(request).then((response: Response) => {
              if (response.ok) {
                void cache.put(request, response.clone())
              }
              return response
            }),
        ),
    ),
  )
})
