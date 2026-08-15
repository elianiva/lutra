import { Brand, Schema } from 'effect'

/**
 * A brand + schema for the identifier of an {@link Edit} — a UUID.
 *
 * Unlike the engine's opaque branded handles (`LayerId`, `LutId`), an Edit id
 * is a stable, externally-visible key: it appears in the URL
 * (`/edit/<uuid>`), in the gallery (the `EditSummary`), and as the primary
 * key of the storage backend. Because it crosses those boundaries it is
 * **format-validated**: a malformed uuid fails the whole decode (docs/adr/0007,
 * 0008, 0009). A corrupt id inside a saved Edit is corruption, not a
 * recoverable case.
 */
export type EditId = string & Brand.Brand<'EditId'>

export const EditId = Brand.nominal<EditId>()

const UUID_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Decodes a string into an `EditId` at schema boundaries. The brand comes from
 * `EditId` (`Brand.nominal`); a `refine` adds the format check so a malformed
 * uuid fails the whole decode. The Encoded form is a plain `string` (a single
 * URL segment), which is what the router's `schemaSegment` and the storage
 * seam require.
 */
export const EditIdSchema = Schema.fromBrand(
  'EditId',
  EditId,
)(Schema.String).pipe(
  Schema.refine((value): value is EditId => UUID_REGEXP.test(value), {
    message: 'must be a valid UUID',
  }),
)

/**
 * Generate a fresh, format-valid Edit id. `crypto.randomUUID` emits a
 * version-4 UUID, which the UUID_REGEXP above accepts (version nibble
 * `[1-8]`, variant nibble `[89ab]`). Used when a new Edit is created — the
 * gallery's "open a photo" flow, and the editor's Save-as fork.
 */
export const newEditId = (): EditId => EditId(crypto.randomUUID())
