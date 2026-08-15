import { describe, it, expect } from 'vitest'
import { FieldKey } from '@lutra/engine'
import { MockImageBitmap } from '../vitest-setup'
import { Idle, editorMachine } from './phase'
import { initialModel } from './model'
import { update } from './update'
import { createLayerFor } from './command'
import { ImageDecodeError } from '../errors'
import {
  SelectedTool,
  SelectedLayer,
  RemovedLayer,
  ConfirmedDraft,
  CancelledDraft,
  UpdatedDraftParam,
  ClearedImage,
  SelectedImageFile,
  ImageDecoded,
  ImageFailedToDecode,
} from './message'
import type { Model } from './model'

// ---- helpers ----

const bitmap = (width: number, height: number) => new MockImageBitmap(width, height)

/** Picked-file bytes for ImageDecoded (the fresh-pick source record). */
const bytes = () => new Uint8Array([1, 2, 3])

/** A model in the Idle phase: image loaded, nothing mid-flight. */
const loadedModel = (): Model => ({
  ...initialModel(),
  phase: Idle(),
  source: { bitmap: bitmap(640, 480), width: 640, height: 480, error: null },
})

const file = () => new File(['x'], 'a.png')

const draftOf = (model: Model) => (model.phase._tag === 'Drafting' ? model.phase.layer : null)

// ---- tests ----

describe('editor phase machine', () => {
  it('compiles to a sound table — no dead transitions, all states reachable', () => {
    expect(editorMachine.unreachableStates()).toEqual([])
    expect(editorMachine.deadTransitions()).toEqual([])
  })

  it('ignores tool selection while no image is loaded', () => {
    const [model, commands] = update(initialModel(), SelectedTool({ type: 'exposure' }))
    expect(model.phase._tag).toBe('Empty')
    expect(commands).toEqual([])
  })

  it('ignores tool selection while a decode is in flight', () => {
    const [loading] = update(initialModel(), SelectedImageFile({ file: file() }))
    expect(loading.phase._tag).toBe('Loading')
    const [model, commands] = update(loading, SelectedTool({ type: 'exposure' }))
    expect(model.phase._tag).toBe('Loading')
    expect(commands).toEqual([])
  })

  it('ignores tool selection after a decode failure', () => {
    const [loading] = update(initialModel(), SelectedImageFile({ file: file() }))
    const [errored] = update(
      loading,
      ImageFailedToDecode({ error: new ImageDecodeError({ message: 'Corrupt' }) }),
    )
    expect(errored.phase._tag).toBe('Error')
    const [model] = update(errored, SelectedTool({ type: 'exposure' }))
    expect(model.phase._tag).toBe('Error')
  })

  it('creates a draft from a tool pick once an image is loaded', () => {
    const [model] = update(loadedModel(), SelectedTool({ type: 'exposure' }))
    expect(model.phase._tag).toBe('Drafting')
    expect(draftOf(model)?.type).toBe('exposure')
  })

  it('blocks tool selection and layer selection while a draft is active', () => {
    const layer = createLayerFor('saturation')
    const withChain = { ...loadedModel(), chain: [layer] }
    const [withDraft] = update(withChain, SelectedTool({ type: 'exposure' }))
    expect(draftOf(withDraft)?.type).toBe('exposure')

    const [m1] = update(withDraft, SelectedTool({ type: 'contrast' }))
    expect(m1.phase._tag).toBe('Drafting')
    expect(draftOf(m1)?.type).toBe('exposure')

    // Selecting a chain layer while a draft is active is blocked — the draft
    // is not silently cancelled (context.md: the editor blocks other
    // interactions while a draft is active).
    const [m2] = update(withDraft, SelectedLayer({ id: layer.id }))
    expect(m2.phase._tag).toBe('Drafting')
    expect(draftOf(m2)?.type).toBe('exposure')
  })

  it('confirms the draft into the chain and focuses it', () => {
    const [withDraft] = update(loadedModel(), SelectedTool({ type: 'exposure' }))
    const layer = draftOf(withDraft)!
    const [model] = update(withDraft, ConfirmedDraft())
    expect(model.phase._tag).toBe('Selected')
    expect(model.chain).toEqual([layer])
    if (model.phase._tag === 'Selected') expect(model.phase.layerId).toBe(layer.id)
  })

  it('cancelling the draft returns to Idle and discards it', () => {
    const [withDraft] = update(loadedModel(), SelectedTool({ type: 'exposure' }))
    const [model] = update(withDraft, CancelledDraft())
    expect(model.phase._tag).toBe('Idle')
    expect(model.chain).toEqual([])
    expect(draftOf(model)).toBeNull()
  })

  it('updates the draft layer in place through the machine', () => {
    const [withDraft] = update(loadedModel(), SelectedTool({ type: 'exposure' }))
    const [model] = update(withDraft, UpdatedDraftParam({ field: FieldKey('stops'), value: 1.5 }))
    expect(draftOf(model)).toMatchObject({ type: 'exposure', stops: 1.5 })
  })

  it('drops a stale decode that lands after the image was cleared', () => {
    const [loading] = update(initialModel(), SelectedImageFile({ file: file() }))
    const [cleared] = update(loading, ClearedImage())
    expect(cleared.phase._tag).toBe('Empty')
    const [model] = update(
      cleared,
      ImageDecoded({ bitmap: bitmap(1, 1), width: 1, height: 1, source: bytes() }),
    )
    expect(model.phase._tag).toBe('Empty')
    expect(model.source.bitmap).toBeNull()
  })

  it('drops a stale decode failure that lands after the image was cleared', () => {
    const [loading] = update(initialModel(), SelectedImageFile({ file: file() }))
    const [cleared] = update(loading, ClearedImage())
    const [model] = update(
      cleared,
      ImageFailedToDecode({ error: new ImageDecodeError({ message: 'Late failure' }) }),
    )
    expect(model.phase._tag).toBe('Empty')
    expect(model.source.error).toBeNull()
  })

  it('last completion wins when two files are selected while loading', () => {
    const [loading] = update(initialModel(), SelectedImageFile({ file: file() }))
    const [stillLoading] = update(loading, SelectedImageFile({ file: file() }))
    expect(stillLoading.phase._tag).toBe('Loading')

    // First pick succeeds, second fails: the current pick's failure shows.
    const b1 = bitmap(1, 1)
    const [first] = update(
      stillLoading,
      ImageDecoded({ bitmap: b1, width: 1, height: 1, source: bytes() }),
    )
    expect(first.source.bitmap).toBe(b1)
    const [failed] = update(
      first,
      ImageFailedToDecode({ error: new ImageDecodeError({ message: 'Second pick failed' }) }),
    )
    expect(failed.phase._tag).toBe('Error')

    // Both succeed: the last one to land wins.
    const [m2] = update(
      stillLoading,
      ImageDecoded({ bitmap: b1, width: 1, height: 1, source: bytes() }),
    )
    const b2 = bitmap(2, 2)
    const [second] = update(m2, ImageDecoded({ bitmap: b2, width: 2, height: 2, source: bytes() }))
    expect(second.source.bitmap).toBe(b2)
    expect(second.phase._tag).toBe('Idle')

    // First pick fails, second succeeds: the success still lands.
    const [errored] = update(
      stillLoading,
      ImageFailedToDecode({ error: new ImageDecodeError({ message: 'First pick failed' }) }),
    )
    expect(errored.phase._tag).toBe('Error')
    const [recovered] = update(
      errored,
      ImageDecoded({ bitmap: b2, width: 2, height: 2, source: bytes() }),
    )
    expect(recovered.source.bitmap).toBe(b2)
    expect(recovered.phase._tag).toBe('Idle')
  })

  it('clearing the image discards the draft and resets the chain', () => {
    const [withDraft] = update(loadedModel(), SelectedTool({ type: 'exposure' }))
    const [model] = update(withDraft, ClearedImage())
    expect(model.phase._tag).toBe('Empty')
    expect(model.source.bitmap).toBeNull()
    expect(model.chain).toEqual([])
  })

  it('removing the focused layer deselects it', () => {
    const layer = createLayerFor('exposure')
    const withChain = { ...loadedModel(), chain: [layer] }
    const [withSelected] = update(withChain, SelectedLayer({ id: layer.id }))
    expect(withSelected.phase._tag).toBe('Selected')
    const [model] = update(withSelected, RemovedLayer({ id: layer.id }))
    expect(model.phase._tag).toBe('Idle')
    expect(model.chain).toEqual([])
  })

  it('removing a non-focused layer keeps the selection', () => {
    const a = createLayerFor('exposure')
    const b = createLayerFor('contrast')
    const withChain = { ...loadedModel(), chain: [a, b] }
    const [withSelected] = update(withChain, SelectedLayer({ id: a.id }))
    expect(withSelected.phase._tag).toBe('Selected')
    const [model] = update(withSelected, RemovedLayer({ id: b.id }))
    expect(model.phase._tag).toBe('Selected')
    expect(model.chain).toEqual([a])
  })

  it('dispatches DecodeImage from the machine edge when a file is selected', () => {
    const [model, commands] = update(initialModel(), SelectedImageFile({ file: file() }))
    expect(model.phase._tag).toBe('Loading')
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('DecodeImage')
  })

  it('file selection is ignored once an image is loaded (must clear first)', () => {
    const [model, commands] = update(loadedModel(), SelectedImageFile({ file: file() }))
    expect(model.phase._tag).toBe('Idle')
    expect(commands).toEqual([])
  })

  it('draft confirm/cancel outside Drafting is ignored', () => {
    const [m1, c1] = update(loadedModel(), ConfirmedDraft())
    expect(m1.phase._tag).toBe('Idle')
    expect(c1).toEqual([])
    const [m2, c2] = update(loadedModel(), CancelledDraft())
    expect(m2.phase._tag).toBe('Idle')
    expect(c2).toEqual([])
  })
})
