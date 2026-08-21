import { Brand, Schema } from 'effect'

/**
 * A brand + schema for the identifier of a {@link Collage} — a UUID.
 *
 * Same posture as an `EditId` (docs/adr/0030): a stable, externally-visible
 * key appearing in the URL (`/collage/<uuid>`) and as the primary key of the
 * storage backend, so it is format-validated — a malformed uuid fails the
 * whole decode. A corrupt id inside a saved Collage is corruption, not a
 * recoverable case.
 */
export type CollageId = string & Brand.Brand<'CollageId'>

export const CollageId = Brand.nominal<CollageId>()

const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Decodes a string into a `CollageId` at schema boundaries. The brand comes
 * from `CollageId` (`Brand.nominal`); a `refine` adds the format check so a
 * malformed uuid fails the whole decode. The Encoded form is a plain `string`
 * (a single URL segment), which is what the router's `schemaSegment` and the
 * storage seam require.
 */
export const CollageIdSchema = Schema.fromBrand(
  'CollageId',
  CollageId,
)(Schema.String).pipe(
  Schema.refine((value): value is CollageId => UUID_REGEXP.test(value), {
    message: 'must be a valid UUID',
  }),
)

/**
 * Generate a fresh, format-valid Collage id. `crypto.randomUUID` emits a
 * version-4 UUID, which the UUID_REGEXP above accepts (version nibble
 * `[1-8]`, variant nibble `[89ab]`). Used when a collage is created — the
 * gallery's persist-first "Create collage" flow.
 */
export const newCollageId = () => CollageId(crypto.randomUUID())
