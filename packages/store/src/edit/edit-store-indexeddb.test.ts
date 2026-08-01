import { describe, expect, it, afterEach } from 'vitest'
import { Effect, Option } from 'effect'
import { EditId } from './edit-id'
import { EditStore, EditStoreIndexedDb, Edit } from '../index'

type EditRecord = typeof Edit.Type

/** A distinct source/thumbnail byte blob so we can tell records apart by field. */
const bytes = (...xs: Array<number>) => new Uint8Array(xs)

const edit = (id: string, savedAt: number): EditRecord =>
  Edit.make({
    id: EditId(id),
    chain: [],
    source: bytes(1, 2, 3),
    thumbnail: bytes(9, 9),
    savedAt,
  })

// The store is a Context.Service: reached via `yield* EditStore` inside an
// Effect, then run against the real IndexedDB backend.
const run = <A, E>(effect: Effect.Effect<A, E, EditStore>) =>
  Effect.runPromise(Effect.provide(effect, EditStoreIndexedDb))

const save = (e: EditRecord) =>
  Effect.gen(function* () {
    const store = yield* EditStore
    yield* store.save(e)
  })

const load = (id: EditId) =>
  Effect.gen(function* () {
    const store = yield* EditStore
    return yield* store.load(id)
  })

const list = () =>
  Effect.gen(function* () {
    const store = yield* EditStore
    return yield* store.list()
  })

// IndexedDB is async and fake-indexeddb caches open connections per DB name;
// clear the store between tests via the seam itself so cases never leak into
// each other.
afterEach(async () => {
  await run(
    Effect.gen(function* () {
      const store = yield* EditStore
      yield* store.clearAll()
    }),
  )
})

describe('EditStoreIndexedDb (IndexedDB local backend)', () => {
  it('round-trips save → load with the whole self-contained Edit', async () => {
    const e = edit('11111111-1111-4111-8111-111111111111', 1000)
    await run(save(e))

    const loaded = await run(load(e.id))
    expect(Option.isSome(loaded)).toBe(true)
    expect(loaded).toEqual(Option.some(e))
  })

  it('load returns Option.None for an unknown id', async () => {
    const loaded = await run(load(EditId('00000000-0000-4000-8000-000000000000')))
    expect(loaded).toEqual(Option.none())
  })

  it('list returns summaries, newest-first by savedAt, without source bytes', async () => {
    const older = edit('11111111-1111-4111-8111-111111111111', 10)
    const newer = edit('22222222-2222-4222-8222-222222222222', 20)
    await run(save(older))
    await run(save(newer))

    const summaries = await run(list())
    expect(summaries.map((s) => s.savedAt)).toEqual([20, 10])

    for (const s of summaries) {
      // Summaries exclude source bytes and carry byteLength instead.
      expect('source' in s).toBe(false)
      expect(s.byteLength).toBe(2)
    }
  })

  it('save upserts by id (Save in place updates, id unchanged)', async () => {
    const id = EditId('11111111-1111-4111-8111-111111111111')
    await run(save(edit(id, 1)))
    await run(save(edit(id, 2)))

    const summaries = await run(list())
    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.savedAt).toBe(2)
  })

  it('delete removes one Edit by id; unknown id is a no-op', async () => {
    const keep = edit('11111111-1111-4111-8111-111111111111', 1)
    const gone = edit('22222222-2222-4222-8222-222222222222', 2)
    await run(save(keep))
    await run(save(gone))

    await run(
      Effect.gen(function* () {
        const store = yield* EditStore
        yield* store.delete(gone.id)
      }),
    )
    expect((await run(list())).map((s) => s.id)).toEqual([keep.id])

    // Deleting a known-absent id doesn't fail.
    await run(
      Effect.gen(function* () {
        const store = yield* EditStore
        yield* store.delete(EditId('00000000-0000-4000-8000-000000000000'))
      }),
    )
    expect((await run(list())).map((s) => s.id)).toEqual([keep.id])
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
