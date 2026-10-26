import { describe, expect, it as vitestIt, afterEach } from 'vitest'
import { it } from '@effect/vitest'
import { Arbitrary, Effect, Option, Schema } from 'effect'
import { EditId } from './edit-id'
import { EditStore, EditStoreIndexedDb, Edit } from '../index'
import { Layer } from '@lutra/engine'

type EditRecord = typeof Edit.Type

/** A distinct source/thumbnail byte blob so we can tell records apart by field. */
const bytes = (...xs: number[]) => new Uint8Array(xs)

const edit = (id: string, savedAt: number): EditRecord =>
  Edit.make({
    chain: [],
    id: EditId(id),
    savedAt,
    source: bytes(1, 2, 3),
    thumbnail: bytes(9, 9),
  })

// The store is a Context.Service: reached via `yield* EditStore` inside an
// Effect, then run against the real IndexedDB backend.
const run = async <A, E>(effect: Effect.Effect<A, E, EditStore>) =>
  await Effect.runPromise(Effect.provide(effect, EditStoreIndexedDb))

const save = (e: EditRecord) =>
  Effect.gen(function* save() {
    const store = yield* EditStore
    yield* store.save(e)
  })

const load = (id: EditId) =>
  Effect.gen(function* load() {
    const store = yield* EditStore
    return yield* store.load(id)
  })

const list = () =>
  Effect.gen(function* list() {
    const store = yield* EditStore
    return yield* store.list()
  })

// IndexedDB is async and fake-indexeddb caches open connections per DB name;
// clear the store between tests so cases never leak into each other.
afterEach(async () => {
  await run(
    Effect.gen(function* () {
      const store = yield* EditStore
      yield* store.clearAll()
    }),
  )
})

/** The gallery summary the store's list() must produce for one row. */
const summaryOf = (e: EditRecord) => ({
  byteLength: e.thumbnail.byteLength,
  chain: e.chain,
  id: e.id,
  savedAt: e.savedAt,
  thumbnail: e.thumbnail,
})

// Property tests derive their inputs from Effect Schemas and generate through
// Effect's `Arbitrary` (docs/adr/0012-property-testing).

const Byte = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 15 }))

/** A version-4 UUID, assembled nibble by nibble so it always passes the
 *  EditIdSchema format check (which a derivation from the refine cannot). */
const uuidArb: Arbitrary.Arbitrary<string> = Arbitrary.map(
  Arbitrary.array(Arbitrary.schema(Byte), { maxLength: 32, minLength: 32 }),
  (nibbles) => {
    const hex = nibbles.map((nibble) => nibble.toString(16))
    hex[12] = '4'
    hex[16] = '8'
    return [
      hex.slice(0, 8).join(''),
      hex.slice(8, 12).join(''),
      hex.slice(12, 16).join(''),
      hex.slice(16, 20).join(''),
      hex.slice(20, 32).join(''),
    ].join('-')
  },
)

const Bytes = Schema.Uint8Array.check(Schema.isMaxLength(24))

/** A random Edit: a fresh id, a savedAt that orders the gallery, a random
 *  layer chain, and bytes. */
const editArb: Arbitrary.Arbitrary<EditRecord> = Arbitrary.map(
  Arbitrary.all({
    chain: Arbitrary.array(Arbitrary.schema(Layer), { maxLength: 4, minLength: 0 }),
    id: uuidArb,
    savedAt: Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))),
    source: Arbitrary.schema(Bytes),
    thumbnail: Arbitrary.schema(Bytes),
  }),
  ({ chain, id, savedAt, source, thumbnail }) =>
    Edit.make({ chain, id: EditId(id), savedAt, source, thumbnail }),
)

/** One store operation. Every operation is always applicable, so the model
 *  needs no separate command-validity check. */
type Op =
  | { readonly _tag: 'Save'; readonly record: EditRecord }
  | { readonly _tag: 'Load'; readonly id: EditId }
  | { readonly _tag: 'Delete'; readonly id: EditId }
  | { readonly _tag: 'List' }

const opArb: Arbitrary.Arbitrary<Op> = Arbitrary.flatMap(
  Arbitrary.schema(Schema.Literals(['Save', 'Load', 'Delete', 'List'])),
  (kind) => {
    switch (kind) {
      case 'Save': {
        return Arbitrary.map(editArb, (record): Op => ({ _tag: 'Save', record }))
      }
      case 'Load': {
        return Arbitrary.map(uuidArb, (id): Op => ({ _tag: 'Load', id: EditId(id) }))
      }
      case 'Delete': {
        return Arbitrary.map(uuidArb, (id): Op => ({ _tag: 'Delete', id: EditId(id) }))
      }
      case 'List': {
        return Arbitrary.Constant<Op>({ _tag: 'List' })
      }
    }
  },
)

describe('EditStoreIndexedDb (IndexedDB local backend)', () => {
  vitestIt(
    'upgrades a v1 database to v2 without touching its Edits (docs/adr/0005-storage)',
    async () => {
      // Build a v1-shaped "lutra" database by hand — the `edits` store, its
      // `saved_at` index, and one encoded row — then open it through the real
      // backend, which must run the v1→v2 migration and leave the row readable.
      //
      // This must stay the FIRST case in the file: fake-indexeddb caches the open
      // connection per database name, so once anything has opened `lutra` the
      // upgrade can no longer be observed.
      const row = {
        id: '11111111-1111-4111-8111-111111111111',
        savedAt: 5,
        chain: [],
        source: new Uint8Array([1, 2, 3]),
        thumbnail: new Uint8Array([9, 9]),
      }
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('lutra', 1)
        open.onupgradeneeded = () => {
          const store = open.result.createObjectStore('edits', { keyPath: 'id' })
          store.createIndex('saved_at', 'savedAt')
          store.put(row)
        }
        open.onsuccess = () => {
          open.result.close()
          resolve()
        }
        open.onerror = () => reject(open.error)
      })

      // The pre-existing row survives, and the store still writes on top of it.
      expect(await run(load(EditId(row.id)))).not.toEqual(Option.none())
      const added = edit('22222222-2222-4222-8222-222222222222', 7)
      await run(save(added))
      expect(await run(list())).toHaveLength(2)

      // v2 is retained as a no-op so databases already at v2 keep opening —
      // IndexedDB refuses to open a database at a lower version than on disk.
      const version = await new Promise<number | null>((resolve) => {
        const open = indexedDB.open('lutra')
        open.onsuccess = () => {
          const { version: v } = open.result
          open.result.close()
          resolve(v)
        }
        open.onerror = () => resolve(null)
      })
      expect(version).toBe(2)
    },
  )

  it.prop('round-trips any Edit through its own schema', { edit: editArb }, ({ edit: record }) => {
    // The record crosses the storage seam as an encoded value: whatever the
    // chain and bytes hold, encoding and decoding must give the same Edit.
    const encoded = Schema.encodeSync(Edit)(record)
    expect(Schema.decodeSync(Edit)(encoded)).toEqual(record)
  })

  vitestIt('load finds an Edit by id even when it is not the first row', async () => {
    // Rows come back in key order, so the second id is not the scan's
    // first row — a load-by-id must still find it (the old
    // first-row-then-check-id implementation returned None here).
    const first = edit('11111111-1111-4111-8111-111111111111', 10)
    const second = edit('22222222-2222-4222-8222-222222222222', 20)
    await run(save(first))
    await run(save(second))

    const loaded = await run(load(second.id))
    expect(loaded).toEqual(Option.some(second))
  })

  it.effect.prop(
    'matches a reference model under any sequence of save/load/delete/list',
    { ops: Arbitrary.array(opArb, { maxLength: 40, minLength: 0 }) },
    ({ ops }) =>
      Effect.gen(function* () {
        const store = yield* EditStore
        // Each run starts from an empty database, mirroring the empty model.
        yield* store.clearAll()
        const rows = new Map<EditId, EditRecord>()
        for (const op of ops) {
          switch (op._tag) {
            case 'Save': {
              rows.set(op.record.id, op.record)
              yield* store.save(op.record)
              break
            }
            case 'Load': {
              const expected = rows.get(op.id)
              const loaded = yield* store.load(op.id)
              expect(loaded).toEqual(expected === undefined ? Option.none() : Option.some(expected))
              break
            }
            case 'Delete': {
              rows.delete(op.id)
              yield* store.delete(op.id)
              break
            }
            case 'List': {
              const summaries = yield* store.list()
              // Newest-first by savedAt; ties fall back to key (id) order —
              // the rows come back from IndexedDB in key order and the sort
              // is stable.
              const expected = [...rows.values()]
                .map(summaryOf)
                .sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? -1 : 1))
              expect(summaries).toEqual(expected)
              // Summaries exclude source bytes and carry byteLength instead.
              for (const summary of summaries) {
                expect('source' in summary).toBe(false)
              }
              break
            }
          }
        }
        return true
      }).pipe(Effect.provide(EditStoreIndexedDb)),
    { arbitrary: { runs: 40 } },
  )

  vitestIt('clearAll removes every Edit', async () => {
    await run(save(edit('11111111-1111-4111-8111-111111111111', 1)))
    await run(
      Effect.gen(function* () {
        const store = yield* EditStore
        yield* store.clearAll()
      }),
    )
    expect(await run(list())).toEqual([])
  })
})
