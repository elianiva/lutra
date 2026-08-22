import { describe, expect, it, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { Effect, Option } from 'effect'
import { CollageId } from './collage-id'
import { Collage, defaultCollageLayout, defaultTileFraming, type CollageTile } from './collage'
import {
  CollageStore,
  CollageStoreIndexedDb,
  EditId,
  EditStore,
  EditStoreIndexedDb,
} from '../index'

type CollageRecord = typeof Collage.Type

const tile = (editId: string): CollageTile => ({
  editId: EditId(editId),
  framing: defaultTileFraming(),
})

const collage = (id: string, savedAt: number): CollageRecord =>
  Collage.make({
    id: CollageId(id),
    savedAt,
    layout: defaultCollageLayout(),
    tiles: [tile('11111111-1111-4111-8111-111111111111')],
  })

// The store is a Context.Service: reached via `yield* CollageStore` inside an
// Effect, then run against the real IndexedDB backend.
const run = async <A, E>(effect: Effect.Effect<A, E, CollageStore>) =>
  await Effect.runPromise(Effect.provide(effect, CollageStoreIndexedDb))

const save = (c: CollageRecord) =>
  Effect.gen(function* save() {
    const store = yield* CollageStore
    yield* store.save(c)
  })

const load = (id: CollageId) =>
  Effect.gen(function* load() {
    const store = yield* CollageStore
    return yield* store.load(id)
  })

const list = () =>
  Effect.gen(function* list() {
    const store = yield* CollageStore
    return yield* store.list()
  })

const del = (id: CollageId) =>
  Effect.gen(function* del() {
    const store = yield* CollageStore
    yield* store.delete(id)
  })

// IndexedDB is async and fake-indexeddb caches open connections per DB name;
// clear the store between tests so cases never leak into each other.
afterEach(async () => {
  await run(
    Effect.gen(function* () {
      const store = yield* CollageStore
      yield* store.clearAll()
    }),
  )
})

// ---- model-based property ----

/** The reference model: exactly the rows the store should hold. */
class Model {
  readonly rows = new Map<CollageId, CollageRecord>()
}

/**
 * A random Collage whose id is a format-valid UUID and whose tiles reference
 * format-valid Edit ids (the schema's refine checks).
 */
const collageArb = fc
  .record({
    id: fc.uuid(),
    savedAt: fc.integer({ max: 10_000, min: 0 }),
    columns: fc.integer({ max: 6, min: 2 }),
    gutter: fc.integer({ max: 32, min: 0 }),
    frameRatio: fc.double({ min: 0.5, max: 3, noNaN: true }),
    background: fc.constantFrom<'dark' | 'light'>('dark', 'light'),
    tiles: fc
      .array(fc.uuid(), { maxLength: 9, minLength: 1 })
      .map((ids) => ids.map((id) => tile(id))),
  })
  .map((r) =>
    Collage.make({
      id: CollageId(r.id),
      savedAt: r.savedAt,
      layout: {
        background: r.background,
        columns: r.columns,
        frameRatio: r.frameRatio,
        gutter: r.gutter,
      },
      tiles: r.tiles,
    }),
  )

class SaveCommand implements fc.AsyncCommand<Model, void> {
  constructor(readonly record: CollageRecord) {}
  check = () => true
  async run(model: Model): Promise<void> {
    model.rows.set(this.record.id, this.record)
    await run(save(this.record))
  }
}

class LoadCommand implements fc.AsyncCommand<Model, void> {
  constructor(readonly id: CollageId) {}
  check = () => true
  async run(model: Model): Promise<void> {
    const expected = model.rows.get(this.id)
    const loaded = await run(load(this.id))
    expect(loaded).toEqual(expected === undefined ? Option.none() : Option.some(expected))
  }
}

class DeleteCommand implements fc.AsyncCommand<Model, void> {
  constructor(readonly id: CollageId) {}
  check = () => true
  async run(model: Model): Promise<void> {
    model.rows.delete(this.id)
    await run(del(this.id))
  }
}

class ListCommand implements fc.AsyncCommand<Model, void> {
  check = () => true
  async run(model: Model): Promise<void> {
    const records = await run(list())
    // Newest-first by savedAt; ties fall back to key (id) order — the rows
    // come back from IndexedDB in key order and the sort is stable.
    const expected = [...model.rows.values()].sort(
      (a, b) => b.savedAt - a.savedAt || (a.id < b.id ? -1 : 1),
    )
    expect(records).toEqual(expected)
  }
}

describe('CollageStoreIndexedDb (IndexedDB local backend)', () => {
  it('migrates an existing v1 database: the collages store appears and edits survive', async () => {
    // Build a v1-shaped "lutra" database by hand — what an install from
    // before docs/adr/0030 has on disk — holding one encoded Edit row.
    const editRow = {
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
        store.put(editRow)
      }
      open.onsuccess = () => {
        open.result.close()
        resolve()
      }
      open.onerror = () => reject(open.error)
    })

    // Opening through the real backend must run v1→v2 without touching the
    // v1 rows, and both stores must work afterwards.
    const loadedEdit = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const edits = yield* EditStore
          return yield* edits.load(EditId(editRow.id))
        }),
        EditStoreIndexedDb,
      ),
    )
    expect(loadedEdit).not.toEqual(Option.none())

    const saved = collage('22222222-2222-4222-8222-222222222222', 7)
    await run(save(saved))
    expect(await run(load(saved.id))).toEqual(Option.some(saved))
  })

  it('load finds a Collage by id even when it is not the first row', async () => {
    const first = collage('11111111-1111-4111-8111-111111111111', 10)
    const second = collage('22222222-2222-4222-8222-222222222222', 20)
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
            collageArb.map((record) => new SaveCommand(record)),
            fc.uuid().map((id) => new LoadCommand(CollageId(id))),
            fc.uuid().map((id) => new DeleteCommand(CollageId(id))),
            fc.constant(new ListCommand()),
          ],
          { maxCommands: 40 },
        ),
        async (commands) => {
          const model = new Model()
          // Each run starts from an empty database, mirroring the empty model.
          await run(
            Effect.gen(function* () {
              const store = yield* CollageStore
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

  it('clearAll removes every Collage', async () => {
    await run(save(collage('11111111-1111-4111-8111-111111111111', 1)))
    await run(
      Effect.gen(function* () {
        const store = yield* CollageStore
        yield* store.clearAll()
      }),
    )
    expect(await run(list())).toEqual([])
  })

  it('a pre-framing record decodes with default framing and a square frame ratio (docs/adr/0033)', async () => {
    // What an install from before docs/adr/0033 has on disk: no `framing`
    // on tiles, a square-only `tileAspect` instead of `frameRatio`.
    const legacyRow = {
      id: '33333333-3333-4333-8333-333333333333',
      savedAt: 3,
      layout: { background: 'dark', columns: 3, gutter: 8, tileAspect: 1 },
      tiles: [{ editId: '11111111-1111-4111-8111-111111111111' }],
    }
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('lutra')
      open.onsuccess = () => {
        const db = open.result
        try {
          const tx = db.transaction('collages', 'readwrite')
          tx.objectStore('collages').put(legacyRow)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => {
            db.close()
            reject(tx.error)
          }
        } catch (error) {
          db.close()
          reject(error)
        }
      }
      open.onerror = () => reject(open.error)
    })

    const loaded = await run(load(CollageId(legacyRow.id)))
    expect(loaded).not.toEqual(Option.none())
    const record = loaded.pipe(Option.getOrThrow)
    expect(record.layout).toEqual({ background: 'dark', columns: 3, frameRatio: 1, gutter: 8 })
    expect(record.tiles[0]).toEqual({
      editId: EditId('11111111-1111-4111-8111-111111111111'),
      framing: defaultTileFraming(),
    })
  })

  it('rejects a malformed Collage id at the storage boundary', async () => {
    // A corrupt id is corruption, not a recoverable case — `Collage.make`
    // refuses to even construct one, so force a raw record past the
    // type-side constructor: the store must still refuse to persist it.
    // SAFETY: this case exists to hand the store a record whose id fails
    // the schema's UUID refine — past Collage.make, which would refuse to
    // build one. The JSON round-trip is that bypass's boundary.
    const raw: CollageRecord = JSON.parse(
      JSON.stringify({
        id: 'not-a-uuid',
        savedAt: 1,
        layout: defaultCollageLayout(),
        tiles: [],
      }),
    )
    await expect(run(save(raw))).rejects.toThrow()
  })
})
