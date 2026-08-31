import { Effect, Layer, Option } from 'effect'
import type { Context } from 'effect'
import type {
  IndexedDbDatabase,
  IndexedDbQueryBuilder,
  IndexedDbTable,
} from '@effect/platform-browser'
import { IndexedDb } from '@effect/platform-browser'
import { LutraDbSchema } from './db'
import { StoreError } from './edit/store-error'

/**
 * Shared scaffolding for the local IndexedDB store backends (docs/adr/0005-storage,
 * 0008, 0030): typed CRUD effects for a schema-backed table, and the fused
 * ready-to-provide Layer that degrades to a rejecting store when the database
 * cannot be opened. The per-store files keep only their contract assembly.
 */

/** The five CRUD effects a table-backed store is built from, error-mapped into `StoreError`. */
export interface TableCrud<RowIn, Row, Key, Summary, R = never> {
  readonly save: (row: RowIn) => Effect.Effect<void, StoreError, R>
  readonly load: (key: Key) => Effect.Effect<Option.Option<Row>, StoreError, R>
  readonly list: () => Effect.Effect<readonly Summary[], StoreError, R>
  readonly delete: (key: Key) => Effect.Effect<void, StoreError, R>
  readonly clearAll: () => Effect.Effect<void, StoreError, R>
}

/**
 * Typed CRUD effects for one schema-backed object store: upsert by id, select
 * one (missing id is `Option.None`), list everything projected through
 * `toSummary` and sorted newest-first by `savedAt` in memory (IndexedDB isn't
 * a relational orderer), delete one, clear all. Backend failures map into a
 * {@link StoreError} labelled with `label`.
 */
export const tableCrud = <Table extends IndexedDbTable.AnyWithProps, Summary>({
  label,
  table,
  toSummary,
}: {
  /** Human-readable store name used in error messages (`'edit'`, `'collage'`). */
  readonly label: string
  /** The resolved query entry point (`(yield* LutraDbSchema).from(Table.tableName)`). */
  readonly table: IndexedDbQueryBuilder.IndexedDbQuery.From<Table>
  /** Project a full row into its listed summary form (identity when rows are listed whole). */
  readonly toSummary: (
    row: IndexedDbQueryBuilder.IndexedDbQuery.SelectType<Table>,
  ) => Summary & { readonly savedAt: number }
}): TableCrud<
  IndexedDbQueryBuilder.IndexedDbQuery.ModifyWithKey<Table>,
  IndexedDbQueryBuilder.IndexedDbQuery.SelectType<Table>,
  IndexedDbQueryBuilder.IndexedDbQuery.EqualsType<Table, never>,
  Summary & { readonly savedAt: number },
  IndexedDbTable.Context<Table>
> => {
  const mapQueryError = (cause: unknown): StoreError =>
    new StoreError({ cause, message: `${label} store query failed` })

  return {
    save: (row) => table.upsert(row).pipe(Effect.asVoid, Effect.mapError(mapQueryError)),

    load: (key) =>
      table
        .select()
        .equals(key)
        .pipe(
          Effect.map((rows) => Option.fromIterable(rows)),
          Effect.mapError(mapQueryError),
        ),

    list: () =>
      table.select().pipe(
        Effect.map((rows) => rows.map(toSummary).sort((a, b) => b.savedAt - a.savedAt)),
        Effect.mapError(mapQueryError),
      ),

    delete: (key) => table.delete().equals(key).pipe(Effect.asVoid, Effect.mapError(mapQueryError)),

    clearAll: () => table.clear.pipe(Effect.mapError(mapQueryError)),
  }
}

/** The failing operations of an unavailable store — every method rejects with the same `StoreError`. */
export interface RejectingOps {
  readonly save: () => Effect.Effect<never, StoreError>
  readonly load: () => Effect.Effect<never, StoreError>
  readonly list: () => Effect.Effect<never, StoreError>
  readonly delete: () => Effect.Effect<never, StoreError>
  readonly clearAll: () => Effect.Effect<never, StoreError>
}

/**
 * A store whose every operation rejects with a `StoreError` — served when the
 * IndexedDB database cannot be opened (blocked, private mode, quota, missing
 * backend). The app stays alive and the owning screen surfaces the failure
 * rather than silently dropping data.
 */
export const rejectingStore = <Contract>(
  ofContract: (ops: RejectingOps) => Contract,
  reason: string,
): Contract => {
  const unavailable = (): Effect.Effect<never, StoreError> =>
    Effect.fail(new StoreError({ cause: undefined, message: reason }))

  return ofContract({
    clearAll: unavailable,
    delete: unavailable,
    list: unavailable,
    load: unavailable,
    save: unavailable,
  })
}

/**
 * The ready-to-provide IndexedDB backend for one store: `live` fused with the
 * shared `"lutra"` database schema and the browser `IndexedDb` primitives.
 * Its error channel is `never`: if the database cannot be opened, the app
 * degrades to a {@link rejectingStore} built through `ofContract` — the
 * owning screen shows its error state instead of the app failing to boot.
 * Wire this into the app resource stack alongside the other backends.
 */
export const indexedDbStoreLayer = <Id, Contract>(
  tag: Context.Key<Id, Contract>,
  live: Layer.Layer<Id, StoreError, IndexedDbDatabase.IndexedDbDatabase>,
  ofContract: (ops: RejectingOps) => Contract,
  databaseLabel: string,
): Layer.Layer<Id> =>
  live.pipe(
    Layer.provide(LutraDbSchema.layer('lutra')),
    Layer.provide(IndexedDb.layerWindow),
    Layer.catch((error) =>
      Layer.succeed(
        tag,
        rejectingStore(
          ofContract,
          `could not open the ${databaseLabel} database: ${error.message}`,
        ),
      ),
    ),
  )
