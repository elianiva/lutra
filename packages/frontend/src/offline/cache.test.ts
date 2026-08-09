import { describe, it, expect } from 'vitest'
import { toLibraryPath } from './cache'

// The browser's Cache Storage resolves the fill's relative put() keys to
// absolute request URLs, so keys() must strip the origin before the diff
// compares against the library's /luts/… paths. The real Cache API is not
// available under happy-dom — this pins the normalization instead
// (docs/adr/0015).

describe('toLibraryPath', () => {
  it('strips the origin from a browser Cache Storage key (an absolute request URL)', () => {
    expect(toLibraryPath('https://lutra.elianiva.com/luts/print/a.cube')).toBe(
      '/luts/print/a.cube',
    )
    expect(toLibraryPath('http://localhost:5173/luts/film_luts.json')).toBe(
      '/luts/film_luts.json',
    )
  })

  it('passes a path with query/fragment through as the pathname only', () => {
    expect(toLibraryPath('https://lutra.elianiva.com/luts/a.cube?x=1#frag')).toBe(
      '/luts/a.cube',
    )
  })

  it('passes relative keys through unchanged (the total fallback)', () => {
    expect(toLibraryPath('/luts/print/a.cube')).toBe('/luts/print/a.cube')
  })
})
