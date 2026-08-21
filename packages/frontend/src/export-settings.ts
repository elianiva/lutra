import { Effect, Option } from 'effect'
import * as Persistence from 'effect/unstable/persistence/KeyValueStore'
import { ExportSettings, defaultExportSettings } from '@lutra/engine'

/**
 * Export-settings persistence, shared by the editor's and the collage's
 * export dialogs (docs/adr/0031): one KeyValueStore key, one schema — both
 * surfaces offer the same format/quality/scale choice and remember it.
 */

export const EXPORT_SETTINGS_KEY = 'exportSettings'

/** Restore persisted export settings; missing or corrupt falls back to defaults. */
export const loadExportSettings: Effect.Effect<
  ExportSettings,
  never,
  Persistence.KeyValueStore
> = Effect.gen(function* loadExportSettings() {
  const store = yield* Persistence.KeyValueStore
  const schemaStore = Persistence.toSchemaStore(store, ExportSettings)
  // `Effect.option` wraps the success (itself an Option) — flatten.
  const saved = Option.flatten(
    yield* schemaStore.get(EXPORT_SETTINGS_KEY).pipe(
      // Missing or corrupt settings fall back to defaults.
      Effect.option,
    ),
  )
  return Option.getOrElse(defaultExportSettings)(saved)
})

/** Persist export settings (fired on every change; localStorage is cheap). */
export const saveExportSettings = (
  settings: ExportSettings,
): Effect.Effect<void, never, Persistence.KeyValueStore> =>
  Effect.gen(function* saveExportSettings() {
    const store = yield* Persistence.KeyValueStore
    yield* Persistence.toSchemaStore(store, ExportSettings)
      .set(EXPORT_SETTINGS_KEY, settings)
      .pipe(Effect.ignore)
  })
