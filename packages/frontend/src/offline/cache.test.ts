import { describe, expect } from 'vitest'
import { it } from '@effect/vitest'
import { Arbitrary, Schema } from 'effect'
import { toLibraryPath } from './cache'

// The browser's Cache Storage resolves the fill's relative put() keys to
// absolute request URLs, so keys() must strip the origin before the diff
// compares against the library's /luts/… paths. The real Cache API is not
// available under happy-dom — this pins the normalization instead
// (docs/adr/0007-offline). Property tests generate through Effect's
// `Arbitrary` (docs/adr/0012-property-testing).

/** Characters a generated URL part is built from, drawn explicitly so the
 *  generator never spends runs rejecting values a pattern would filter. */
const charArb = (chars: string): Arbitrary.Arbitrary<string> =>
  Arbitrary.map(Arbitrary.schema(Schema.Literals(chars.split(''))), (char) => char)

const runOf = (chars: string, options: Arbitrary.ArrayOptions): Arbitrary.Arbitrary<string> =>
  Arbitrary.map(Arbitrary.array(charArb(chars), options), (parts) => parts.join(''))

const HOST_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const PATH_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789._~-'

/** Any absolute URL the browser could store a request under: a host, an
 *  optional path, and optional query and fragment parts that carry no
 *  delimiter of their own. */
const absoluteUrlArb = Arbitrary.map(
  Arbitrary.all({
    host: Arbitrary.map(
      Arbitrary.all({
        label: runOf(HOST_CHARS, { maxLength: 8, minLength: 1 }),
        tld: Arbitrary.schema(Schema.Literals(['com', 'dev', 'invalid', 'test'])),
      }),
      ({ label, tld }) => `${label}.${tld}`,
    ),
    path: Arbitrary.array(runOf(PATH_CHARS, { maxLength: 20, minLength: 1 }), {
      maxLength: 3,
      minLength: 0,
    }),
    query: runOf('abcdefghij', { maxLength: 6, minLength: 0 }),
    fragment: runOf('abcdefghij', { maxLength: 6, minLength: 0 }),
  }),
  ({ host, path, query, fragment }) =>
    `https://${host}${path.map((segment) => `/${segment}`).join('')}${query === '' ? '' : `?${query}`}${
      fragment === '' ? '' : `#${fragment}`
    }`,
)

/** Any relative key the fill's diff could hold: a single leading slash,
 *  path-ish characters, and no `.`/`..` segments (URL parsing collapses
 *  those, and the fill's keys never contain them). */
const relativePathArb = Arbitrary.filter(
  Arbitrary.map(
    Arbitrary.array(runOf(PATH_CHARS, { maxLength: 20, minLength: 1 }), {
      maxLength: 3,
      minLength: 0,
    }),
    (segments) => `/${segments.join('/')}`,
  ),
  (path) => !path.split('/').some((segment) => segment === '.' || segment === '..'),
)

describe('toLibraryPath', () => {
  it.prop('reduces any absolute URL to its bare pathname', { url: absoluteUrlArb }, ({ url }) => {
    const path = toLibraryPath(url)
    // The result is a pure path: no origin, no query, no fragment
    // (a pathname may legitimately contain "://", so only the delimiters
    // that would corrupt the diff are asserted).
    expect(path.startsWith('/')).toBe(true)
    expect(path).not.toContain('?')
    expect(path).not.toContain('#')
    // …and it is exactly the URL's pathname.
    expect(path).toBe(new URL(url, 'https://lutra.invalid').pathname)
  })

  it.prop(
    'passes canonical relative keys through unchanged (the total fallback)',
    { path: relativePathArb },
    ({ path }) => {
      expect(toLibraryPath(path)).toBe(path)
    },
  )

  it.prop('is total on any input (it never throws)', { key: Schema.String }, ({ key }) => {
    expect(toLibraryPath(key)).toEqual(expect.any(String))
  })
})
