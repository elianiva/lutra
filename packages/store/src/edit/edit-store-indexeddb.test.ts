import { describe, expect, it, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { Effect, Option } from 'effect'
import { EditId } from './edit-id'
import { EditStore, EditStoreIndexedDb, Edit } from '../index'

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

const del = (id: EditId) =>
  Effect.gen(function* del() {
    const store = yield* EditStore
    yield* store.delete(id)
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

/** The reference model: exactly the rows the store should hold. */
class Model {
  readonly rows = new Map<EditId, EditRecord>()
}

/** The gallery summary the store's list() must produce for one row. */
const summaryOf = (e: EditRecord) => ({
  byteLength: e.thumbnail.byteLength,
  chain: e.chain,
  id: e.id,
  savedAt: e.savedAt,
  thumbnail: e.thumbnail,
})

/** A random Edit whose id is a format-valid UUID (the EditIdSchema check). */
const editArb = fc
  .record({
    id: fc.uuid(),
    savedAt: fc.integer({ max: 10_000, min: 0 }),
    source: fc.uint8Array({ maxLength: 24, minLength: 0 }),
    thumbnail: fc.uint8Array({ maxLength: 24, minLength: 0 }),
  })
  .map((r) =>
    Edit.make({
      chain: [],
      id: EditId(r.id),
      savedAt: r.savedAt,
      source: r.source,
      thumbnail: r.thumbnail,
    }),
  )

class SaveCommand implements fc.AsyncCommand<Model, void> {
  constructor(readonly record: EditRecord) {}
  check = () => true
  async run(model: Model): Promise<void> {
    model.rows.set(this.record.id, this.record)
    await run(save(this.record))
  }
}

class LoadCommand implements fc.AsyncCommand<Model, void> {
  constructor(readonly id: EditId) {}
  check = () => true
  async run(model: Model): Promise<void> {
    const expected = model.rows.get(this.id)
    const loaded = await run(load(this.id))
    expect(loaded).toEqual(expected === undefined ? Option.none() : Option.some(expected))
  }
}

class DeleteCommand implements fc.AsyncCommand<Model, void> {
  constructor(readonly id: EditId) {}
  check = () => true
  async run(model: Model): Promise<void> {
    model.rows.delete(this.id)
    await run(del(this.id))
  }
}

class ListCommand implements fc.AsyncCommand<Model, void> {
  check = () => true
  async run(model: Model): Promise<void> {
    const summaries = await run(list())
    // Newest-first by savedAt; ties fall back to key (id) order — the rows
    // come back from IndexedDB in key order and the sort is stable.
    const expected = [...model.rows.values()]
      .map(summaryOf)
      .sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? -1 : 1))
    expect(summaries).toEqual(expected)
    // Summaries exclude source bytes and carry byteLength instead.
    for (const s of summaries) {
      expect('source' in s).toBe(false)
    }
  }
}

describe('EditStoreIndexedDb (IndexedDB local backend)', () => {
  it('upgrades a v1 database to v2 without touching its Edits (docs/adr/0005-storage)', async () => {
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
  })

  it('load finds an Edit by id even when it is not the first row', async () => {
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

  it('matches a reference model under any sequence of save/load/delete/list', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.commands(
          [
            editArb.map((record) => new SaveCommand(record)),
            fc.uuid().map((id) => new LoadCommand(EditId(id))),
            fc.uuid().map((id) => new DeleteCommand(EditId(id))),
            fc.constant(new ListCommand()),
          ],
          { maxCommands: 40 },
        ),
        async (commands) => {
          const model = new Model()
          // Each run starts from an empty database, mirroring the empty model.
          await run(
            Effect.gen(function* () {
              const store = yield* EditStore
              yield* store.clearAll()
            }),
          )
          for (const command of commands) {
            if (command.check(model)) {
              await command.run(model, undefined)
            }
          }
        },
      ),
      { numRuns: 40 },
    )
  })

  it('clearAll removes every Edit', async () => {
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
