import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { FieldKey } from '@lutra/engine'
import { MockImageBitmap } from '../vitest-setup'
import { Idle, editorMachine } from './phase'
import { initialModel } from './model'
import { update } from './update'
import { createLayerFor } from './command'
import { selectTool } from './test-layer'
import { ImageDecodeError, LayerCreationError } from '../errors'
import { EditorMessage } from './message'
import type { Model } from './model'

const bitmap = (width: number, height: number) => new MockImageBitmap(width, height)

/** Picked-file bytes for ImageDecoded (the fresh-pick source record). */
const bytes = () => new Uint8Array([1, 2, 3])

/** A model in the Idle phase: image loaded, nothing mid-flight. */
const loadedModel = (): Model => ({
  ...initialModel(),
  phase: Idle(),
  source: { bitmap: bitmap(640, 480), error: null, height: 480, width: 640 },
})

const file = () => new File(['x'], 'a.png')

const draftOf = (model: Model) => (model.phase._tag === 'Drafting' ? model.phase.layer : null)

describe('editor phase machine', () => {
  it('compiles to a sound table — no dead transitions, all states reachable', () => {
    expect(editorMachine.unreachableStates()).toEqual([])
    expect(editorMachine.deadTransitions()).toEqual([])
  })

  it('ignores tool selection while no image is loaded', () => {
    const { model, commands = [] } = update(
      initialModel(),
      EditorMessage.SelectedTool({ type: 'exposure' }),
    )
    expect(model.phase._tag).toBe('Empty')
    expect(commands).toEqual([])
  })

  it('ignores tool selection while a decode is in flight', () => {
    const { model: loading } = update(initialModel(), EditorMessage.SelectedImageFile({ file: file() }))
    expect(loading.phase._tag).toBe('Loading')
    const { model, commands = [] } = update(loading, EditorMessage.SelectedTool({ type: 'exposure' }))
    expect(model.phase._tag).toBe('Loading')
    expect(commands).toEqual([])
  })

  it('ignores tool selection after a decode failure', () => {
    const { model: loading } = update(initialModel(), EditorMessage.SelectedImageFile({ file: file() }))
    const { model: errored } = update(
      loading,
      EditorMessage.ImageFailedToDecode({ error: new ImageDecodeError({ message: 'Corrupt' }) }),
    )
    expect(errored.phase._tag).toBe('Error')
    const { model } = update(errored, EditorMessage.SelectedTool({ type: 'exposure' }))
    expect(model.phase._tag).toBe('Error')
  })

  it('runs layer creation as a command and installs its result', () => {
    const { model: pending, commands = [] } = update(
      loadedModel(),
      EditorMessage.SelectedTool({ type: 'exposure' }),
    )
    expect(pending.phase._tag).toBe('Creating')
    expect(commands.map((command) => command.name)).toEqual(['CreateLayer'])

    const { model } = update(
      pending,
      EditorMessage.LayerCreated({ layer: Effect.runSync(createLayerFor('exposure')) }),
    )
    expect(model.phase._tag).toBe('Drafting')
    expect(draftOf(model)?.type).toBe('exposure')
  })

  it('restores the idle phase and records a layer creation failure', () => {
    const { model: pending } = update(loadedModel(), EditorMessage.SelectedTool({ type: 'exposure' }))
    const error = new LayerCreationError({ message: 'registry failure' })
    const { model, commands = [] } = update(pending, EditorMessage.LayerCreationFailed({ error }))
    expect(model.phase._tag).toBe('Idle')
    expect(model.layerCreationError).toMatchObject({
      _tag: 'LayerCreationError',
      message: 'registry failure',
    })
    expect(commands).toEqual([])
  })

  it('creates a draft from a tool pick once an image is loaded', () => {
    const { model } = selectTool(loadedModel(), 'exposure')
    expect(model.phase._tag).toBe('Drafting')
    expect(draftOf(model)?.type).toBe('exposure')
  })

  it('blocks tool selection and layer selection while a draft is active', () => {
    const layer = Effect.runSync(createLayerFor('saturation'))
    const withChain = { ...loadedModel(), chain: [layer] }
    const { model: withDraft } = selectTool(withChain, 'exposure')
    expect(draftOf(withDraft)?.type).toBe('exposure')

    const { model: m1 } = selectTool(withDraft, 'contrast')
    expect(m1.phase._tag).toBe('Drafting')
    expect(draftOf(m1)?.type).toBe('exposure')

    // Selecting a chain layer while a draft is active is blocked — the draft
    // is not silently cancelled (context.md: the editor blocks other
    // interactions while a draft is active).
    const { model: m2 } = update(withDraft, EditorMessage.SelectedLayer({ id: layer.id }))
    expect(m2.phase._tag).toBe('Drafting')
    expect(draftOf(m2)?.type).toBe('exposure')
  })

  it('confirms the draft into the chain and focuses it', () => {
    const { model: withDraft } = selectTool(loadedModel(), 'exposure')
    const layer = draftOf(withDraft)!
    const { model } = update(withDraft, EditorMessage.ConfirmedDraft())
    expect(model.phase._tag).toBe('Selected')
    expect(model.chain).toEqual([layer])
    if (model.phase._tag === 'Selected') {
      expect(model.phase.layerId).toBe(layer.id)
    }
  })

  it('cancelling the draft returns to Idle and discards it', () => {
    const { model: withDraft } = selectTool(loadedModel(), 'exposure')
    const { model } = update(withDraft, EditorMessage.CancelledDraft())
    expect(model.phase._tag).toBe('Idle')
    expect(model.chain).toEqual([])
    expect(draftOf(model)).toBeNull()
  })

  it('updates the draft layer in place through the machine', () => {
    const { model: withDraft } = selectTool(loadedModel(), 'exposure')
    const { model } = update(
      withDraft,
      EditorMessage.UpdatedDraftParam({ field: FieldKey('stops'), value: 1.5 }),
    )
    expect(draftOf(model)).toMatchObject({ stops: 1.5, type: 'exposure' })
  })

  it('drops a stale decode that lands after the image was cleared', () => {
    const { model: loading } = update(initialModel(), EditorMessage.SelectedImageFile({ file: file() }))
    const { model: cleared } = update(loading, EditorMessage.ClearedImage())
    expect(cleared.phase._tag).toBe('Empty')
    const { model } = update(
      cleared,
      EditorMessage.ImageDecoded({ bitmap: bitmap(1, 1), height: 1, source: bytes(), width: 1 }),
    )
    expect(model.phase._tag).toBe('Empty')
    expect(model.source.bitmap).toBeNull()
  })

  it('drops a stale decode failure that lands after the image was cleared', () => {
    const { model: loading } = update(initialModel(), EditorMessage.SelectedImageFile({ file: file() }))
    const { model: cleared } = update(loading, EditorMessage.ClearedImage())
    const { model } = update(
      cleared,
      EditorMessage.ImageFailedToDecode({
        error: new ImageDecodeError({ message: 'Late failure' }),
      }),
    )
    expect(model.phase._tag).toBe('Empty')
    expect(model.source.error).toBeNull()
  })

  it('last completion wins when two files are selected while loading', () => {
    const { model: loading } = update(initialModel(), EditorMessage.SelectedImageFile({ file: file() }))
    const { model: stillLoading } = update(loading, EditorMessage.SelectedImageFile({ file: file() }))
    expect(stillLoading.phase._tag).toBe('Loading')

    // First pick succeeds, second fails: the current pick's failure shows.
    const b1 = bitmap(1, 1)
    const { model: first } = update(
      stillLoading,
      EditorMessage.ImageDecoded({ bitmap: b1, height: 1, source: bytes(), width: 1 }),
    )
    expect(first.source.bitmap).toBe(b1)
    const { model: failed } = update(
      first,
      EditorMessage.ImageFailedToDecode({
        error: new ImageDecodeError({ message: 'Second pick failed' }),
      }),
    )
    expect(failed.phase._tag).toBe('Error')

    // Both succeed: the last one to land wins.
    const { model: m2 } = update(
      stillLoading,
      EditorMessage.ImageDecoded({ bitmap: b1, height: 1, source: bytes(), width: 1 }),
    )
    const b2 = bitmap(2, 2)
    const { model: second } = update(
      m2,
      EditorMessage.ImageDecoded({ bitmap: b2, height: 2, source: bytes(), width: 2 }),
    )
    expect(second.source.bitmap).toBe(b2)
    expect(second.phase._tag).toBe('Idle')

    // First pick fails, second succeeds: the success still lands.
    const { model: errored } = update(
      stillLoading,
      EditorMessage.ImageFailedToDecode({
        error: new ImageDecodeError({ message: 'First pick failed' }),
      }),
    )
    expect(errored.phase._tag).toBe('Error')
    const { model: recovered } = update(
      errored,
      EditorMessage.ImageDecoded({ bitmap: b2, height: 2, source: bytes(), width: 2 }),
    )
    expect(recovered.source.bitmap).toBe(b2)
    expect(recovered.phase._tag).toBe('Idle')
  })

  it('clearing the image discards the draft and resets the chain', () => {
    const { model: withDraft } = selectTool(loadedModel(), 'exposure')
    const { model } = update(withDraft, EditorMessage.ClearedImage())
    expect(model.phase._tag).toBe('Empty')
    expect(model.source.bitmap).toBeNull()
    expect(model.chain).toEqual([])
  })

  it('removing the focused layer deselects it', () => {
    const layer = Effect.runSync(createLayerFor('exposure'))
    const withChain = { ...loadedModel(), chain: [layer] }
    const { model: withSelected } = update(withChain, EditorMessage.SelectedLayer({ id: layer.id }))
    expect(withSelected.phase._tag).toBe('Selected')
    const { model } = update(withSelected, EditorMessage.RemovedLayer({ id: layer.id }))
    expect(model.phase._tag).toBe('Idle')
    expect(model.chain).toEqual([])
  })

  it('removing a non-focused layer keeps the selection', () => {
    const a = Effect.runSync(createLayerFor('exposure'))
    const b = Effect.runSync(createLayerFor('contrast'))
    const withChain = { ...loadedModel(), chain: [a, b] }
    const { model: withSelected } = update(withChain, EditorMessage.SelectedLayer({ id: a.id }))
    expect(withSelected.phase._tag).toBe('Selected')
    const { model } = update(withSelected, EditorMessage.RemovedLayer({ id: b.id }))
    expect(model.phase._tag).toBe('Selected')
    expect(model.chain).toEqual([a])
  })

  it('dispatches DecodeImage from the machine edge when a file is selected', () => {
    const { model, commands = [] } = update(
      initialModel(),
      EditorMessage.SelectedImageFile({ file: file() }),
    )
    expect(model.phase._tag).toBe('Loading')
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('DecodeImage')
  })

  it('file selection is ignored once an image is loaded (must clear first)', () => {
    const { model, commands = [] } = update(
      loadedModel(),
      EditorMessage.SelectedImageFile({ file: file() }),
    )
    expect(model.phase._tag).toBe('Idle')
    expect(commands).toEqual([])
  })

  it('draft confirm/cancel outside Drafting is ignored', () => {
    const { model: m1, commands: c1 = [] } = update(loadedModel(), EditorMessage.ConfirmedDraft())
    expect(m1.phase._tag).toBe('Idle')
    expect(c1).toEqual([])
    const { model: m2, commands: c2 = [] } = update(loadedModel(), EditorMessage.CancelledDraft())
    expect(m2.phase._tag).toBe('Idle')
    expect(c2).toEqual([])
  })
})
