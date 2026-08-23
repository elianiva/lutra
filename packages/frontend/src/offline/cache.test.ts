import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { toLibraryPath } from './cache'

// The browser's Cache Storage resolves the fill's relative put() keys to
// absolute request URLs, so keys() must strip the origin before the diff
// compares against the library's /luts/… paths. The real Cache API is not
// available under happy-dom — this pins the normalization instead
// (docs/adr/0007-offline).

/** Any absolute URL the browser could store a request under. */
const absoluteUrlArb = fc.webUrl()
/** Any relative key the fill's diff could hold: a single leading slash,
 *  path-ish characters, and no `.`/`..` segments (URL parsing collapses
 *  those, and the fill's keys never contain them). */
const relativePathArb = fc
  .stringMatching(/^\/([a-z0-9/._~-]{0,80})$/)
  .filter(
    (p) =>
      !p.startsWith('//') && !p.split('/').some((segment) => segment === '.' || segment === '..'),
  )

describe('toLibraryPath', () => {
  it('reduces any absolute URL to its bare pathname', () => {
    fc.assert(
      fc.property(absoluteUrlArb, (url) => {
        const path = toLibraryPath(url)
        // The result is a pure path: no origin, no query, no fragment
        // (a pathname may legitimately contain "://", so only the delimiters
        // that would corrupt the diff are asserted).
        expect(path.startsWith('/')).toBe(true)
        expect(path).not.toContain('?')
        expect(path).not.toContain('#')
        // …and it is exactly the URL's pathname.
        expect(path).toBe(new URL(url, 'https://lutra.invalid').pathname)
      }),
    )
  })

  it('passes canonical relative keys through unchanged (the total fallback)', () => {
    fc.assert(
      fc.property(relativePathArb, (path) => {
        expect(toLibraryPath(path)).toBe(path)
      }),
    )
  })

  it('is total on any input (it never throws)', () => {
    fc.assert(
      fc.property(fc.string(), (key) => {
        expect(toLibraryPath(key)).toEqual(expect.any(String))
      }),
    )
  })
})
