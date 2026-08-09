import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSwSource, shellCacheName } from '../../../../scripts/build-sw'
import { LUT_CACHE_NAME } from './cache'

// The service worker and the page share facts that must never drift
// (docs/adr/0015): the offline library's cache name, the precache injection
// mechanism, and the shell cache name (a hash of the precache manifest — the
// deploy-unique versioning that keeps old hashed assets from accumulating
// across releases). The build script injects the tokens at build time; these
// tests pin the coupling so a rename on either side fails loudly.

const here = path.dirname(fileURLToPath(import.meta.url))
const swSource = readFileSync(path.resolve(here, '../../sw/sw.ts'), 'utf8')

describe('service worker / page coupling', () => {
  it('the SW source keeps the cache-name tokens (scripts/build-sw.ts injects them)', () => {
    expect(swSource).toContain('__LUT_CACHE_NAME__')
    expect(swSource).toContain('__SHELL_CACHE_NAME__')
    expect(swSource).not.toContain("'lutra-luts'")
    // The shell cache name comes from the injected token, not a hardcoded
    // versioned literal — the deploy-unique name is what purges the previous
    // shell wholesale. (The 'lutra-shell-' prefix in the activate purge
    // filter stays.)
    expect(swSource).toContain('SHELL_CACHE = __SHELL_CACHE_NAME__')
  })

  it("the build injection produces the page's actual cache name", () => {
    const generated = generateSwSource(swSource, ['/index.html'], LUT_CACHE_NAME)
    expect(generated).toContain(`const LUT_CACHE = "${LUT_CACHE_NAME}"`)
  })

  it('the shell cache name is a stable hash of the precache manifest', () => {
    const manifestA = ['/index.html', '/assets/index-AAA.js']
    const manifestB = ['/index.html', '/assets/index-BBB.js']
    expect(shellCacheName(manifestA)).toMatch(/^lutra-shell-[0-9a-f]{8}$/)
    // The same manifest always names the same cache (a rebuild of identical
    // output must not orphan the previous shell).
    expect(shellCacheName(manifestA)).toBe(shellCacheName([...manifestA]))
    // A different manifest names a different cache — the deploy-unique
    // versioning that purges the previous shell wholesale.
    expect(shellCacheName(manifestA)).not.toBe(shellCacheName(manifestB))
  })

  it('the build injection embeds the shell cache name verbatim', () => {
    const manifest = ['/index.html', '/manifest.webmanifest', '/assets/index-HASH.js']
    const generated = generateSwSource(swSource, manifest, LUT_CACHE_NAME)
    expect(generated).toContain(`const SHELL_CACHE = "${shellCacheName(manifest)}"`)
  })

  it('the build injection embeds the precache manifest verbatim', () => {
    const manifest = ['/index.html', '/manifest.webmanifest', '/assets/index-HASH.js']
    const generated = generateSwSource(swSource, manifest, LUT_CACHE_NAME)
    for (const entry of manifest) {
      expect(generated).toContain(JSON.stringify(entry))
    }
  })

  it('the SW never touches the offline library cache (shell purge only)', () => {
    // The purge filter must be shell-scoped — deleting "lutra-luts" on
    // activate would destroy the offline library on every deploy.
    const purgeBlock = swSource.slice(
      swSource.indexOf("key.startsWith('lutra-shell-')"),
      swSource.indexOf("key.startsWith('lutra-shell-')") + 200,
    )
    expect(purgeBlock).toContain('lutra-shell-')
    expect(purgeBlock).not.toContain(LUT_CACHE_NAME)
  })
})
