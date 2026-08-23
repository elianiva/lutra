import { Schema } from 'effect'

/**
 * The tagged error a failed {@link EditStore} operation raises — a genuine
 * failure (quota, blocked access, corruption, a missing backend), **not** a
 * missing record: `load` reports an absent id as `Option.None`, and `delete`
 * of an unknown id is a no-op. The frontend surfaces this in the gallery /
 * Options surface; a future sync backend distinguishes local from server
 * failures through new error classes.
 */
export class StoreError extends Schema.TaggedError<StoreError>()('StoreError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}
