// Builds dist/sw.js after `vite build`: reads the build's asset list,
// injects it (plus the shell cache name it implies and the shared LUT cache
// name) into sw/sw.ts, and bundles the result. The service worker's precache
// manifest can only exist at build time — the hashed asset names are a build
// artifact (docs/adr/0015).
//
// `generateSwSource` is exported pure for the SW-coupling test
// (src/offline/sw-source.test.ts): the page's cache name and the SW's are
// kept in sync by construction, and the test pins it.
/// <reference types="bun" />
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { LUT_CACHE_NAME } from '../packages/frontend/src/offline/cache.js'

const here = import.meta.dirname
const frontend = path.resolve(here, '../packages/frontend')
const dist = path.join(frontend, 'dist')

/** The shell cache name for a deploy: a short hash of the precache
 *  manifest. The manifest changes whenever any hashed asset does, so every
 *  deploy installs into a fresh cache and activate purges the previous
 *  deploy's shell wholesale — old hashed assets never accumulate across
 *  releases (docs/adr/0015). Exported for the SW-coupling test. */
export const shellCacheName = (precache: readonly string[]): string =>
  `lutra-shell-${createHash('sha256').update(JSON.stringify(precache)).digest('hex').slice(0, 8)}`

/** Inject the precache manifest, the shell cache name, and the shared cache
 *  name into the SW source. Pure — the test asserts the injection uses the
 *  page's actual LUT_CACHE_NAME and derives the shell name from the
 *  manifest. The `declare const` lines (typecheck-only annotations for the
 *  tokens) are stripped first: the tokens only exist at build time. */
export const generateSwSource = (
  source: string,
  precache: readonly string[],
  lutCacheName: string,
  shellCache: string = shellCacheName(precache),
): string =>
  source
    .replaceAll(
      /^declare const __(?:LUT_CACHE_NAME|PRECACHE_MANIFEST|SHELL_CACHE_NAME)__[^\n]*\n/gm,
      '',
    )
    .replaceAll('__PRECACHE_MANIFEST__', JSON.stringify(precache))
    .replaceAll('__LUT_CACHE_NAME__', JSON.stringify(lutCacheName))
    .replaceAll('__SHELL_CACHE_NAME__', JSON.stringify(shellCache))

const run = async (): Promise<void> => {
  const [assets, icons] = await Promise.all([
    readdir(path.join(dist, 'assets')),
    readdir(path.join(dist, 'icons')),
  ])
  // The app shell: the document, the manifest, the icons (including the iOS
  // splash screens), and every hashed asset (JS/CSS/fonts/encode-wasm). NOT
  // /luts/* — the offline library is the page-driven fill's job
  // (docs/adr/0015).
  const precache = [
    '/index.html',
    '/manifest.webmanifest',
    ...icons.map((file) => `/icons/${file}`),
    ...assets.map((file) => `/assets/${file}`),
  ]

  const source = await readFile(path.join(frontend, 'sw/sw.ts'), 'utf-8')
  const bundled = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    generateSwSource(source, precache, LUT_CACHE_NAME),
  )
  await writeFile(path.join(dist, 'sw.js'), bundled)
  console.log(
    `sw.js written — ${precache.length} precached files, shell cache ${shellCacheName(precache)}`,
  )
}

if (import.meta.main) {
  void run()
}
