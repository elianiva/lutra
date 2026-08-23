import { describe, it, expect } from 'vitest'
import { Option } from 'effect'
import type { Command } from 'foldkit'
import {
  Command as SceneCommand,
  Mount,
  click,
  expect as sceneExpect,
  expectOutMessage,
  given,
  role,
  scene,
  text,
} from 'foldkit/scene'
import { MockImageBitmap } from '../vitest-setup'
import { RenderHandle } from '../gpu/backend'
import { EditId, StoreError } from '@lutra/store'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { SaveEdit } from './command'
import { EditorMessage, EditorOutMessage } from './message'
import { Idle, Loading } from './phase'

const id = () => EditId('11111111-1111-4111-8111-111111111111')
const otherId = () => EditId('22222222-2222-4222-8222-222222222222')
const bitmap = (width = 640, height = 480) => new MockImageBitmap(width, height)
const source = () => new Uint8Array([1, 2, 3])
// SAFETY: fabricated GPU handle stub — tests never execute GPU work, so only its type flows through the model; the buffer has no backing storage and is never read.
const handle = () =>
  // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
  new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, map: null })

/** An editor with a loaded, rendered image and an attached-edit record. */
const loaded = (attached: { id: EditId | null; source: Uint8Array }) => ({
  ...initialModel(),
  attachedEdit: attached,
  lastRender: handle(),
  phase: Idle(),
  renderedStamp: 1,
  source: { bitmap: bitmap(), error: null, height: 480, width: 640 },
})

/** The SaveEdit command among a command list, if one was dispatched. */
const saveEditOf = (commands: readonly Command.Command<unknown, unknown, unknown>[]) =>
  commands.find((c) => c.name === 'SaveEdit')

describe('editor: save flow (Save / Save as)', () => {
  it('SaveRequested without an image dispatches nothing', () => {
    const [model, commands, out] = update(initialModel(), EditorMessage.SaveRequested())
    expect(model).toEqual(initialModel())
    expect(commands).toEqual([])
    expect(Option.isNone(out)).toBe(true)
  })

  it('SaveRequested saves in place when the editor is attached', () => {
    const [model, commands, out] = update(
      loaded({ id: id(), source: source() }),
      EditorMessage.SaveRequested(),
    )
    expect(model.saveStatus).toEqual({ _tag: 'saving' })
    expect(saveEditOf(commands)?.args?.id).toBe(id())
    expect(Option.isNone(out)).toBe(true)
  })

  it('SaveRequested creates a new Edit when the image was picked fresh in-editor', () => {
    const [, commands] = update(
      loaded({ id: null, source: source() }),
      EditorMessage.SaveRequested(),
    )
    const save = saveEditOf(commands)
    // The picked file's bytes are the new Edit's source — unchanged.
    expect(save?.args?.id).toBeNull()
    expect(save?.args?.source).toEqual(source())
    expect(save?.args?.chain).toEqual([])
  })

  it('SaveAsRequested always forks a new Edit, even when attached', () => {
    const [, commands] = update(
      loaded({ id: id(), source: source() }),
      EditorMessage.SaveAsRequested(),
    )
    expect(saveEditOf(commands)?.args?.id).toBeNull()
  })

  it('Save as on a fresh pick forks like Save', () => {
    const [, commands] = update(
      loaded({ id: null, source: source() }),
      EditorMessage.SaveAsRequested(),
    )
    expect(saveEditOf(commands)?.args?.id).toBeNull()
  })

  it('a save in flight ignores further save requests (at most one at a time)', () => {
    const busy = {
      ...loaded({ id: id(), source: source() }),
      saveStatus: { _tag: 'saving' } as const,
    }
    const [model, commands] = update(busy, EditorMessage.SaveRequested())
    expect(model).toEqual(busy)
    expect(commands).toEqual([])
  })

  it('EditSaved attaches the model to a fresh-pick save and surfaces EditCreated', () => {
    const [model, commands, out] = update(
      loaded({ id: null, source: source() }),
      EditorMessage.EditSaved({ id: id(), savedAt: 1234 }),
    )
    expect(model.attachedEdit).toEqual({ id: id(), source: source() })
    expect(model.saveStatus).toEqual({ _tag: 'saved', at: 1234 })
    expect(commands).toEqual([])
    expect(out).toEqual(Option.some(EditorOutMessage.EditCreated({ id: id() })))
  })

  it('an in-place save keeps the attachment and emits no EditCreated', () => {
    const [model, , out] = update(
      loaded({ id: id(), source: source() }),
      EditorMessage.EditSaved({ id: id(), savedAt: 1234 }),
    )
    expect(model.attachedEdit).toEqual({ id: id(), source: source() })
    expect(out).toEqual(Option.none())
  })

  it('a Save as result re-points the attachment and surfaces EditCreated', () => {
    const [model, , out] = update(
      loaded({ id: id(), source: source() }),
      EditorMessage.EditSaved({ id: otherId(), savedAt: 5 }),
    )
    expect(model.attachedEdit).toEqual({ id: otherId(), source: source() })
    expect(out).toEqual(Option.some(EditorOutMessage.EditCreated({ id: otherId() })))
  })

  it('SaveFailed records the reason for the top bar', () => {
    const [model, commands, out] = update(
      loaded({ id: id(), source: source() }),
      EditorMessage.SaveFailed({ error: new StoreError({ message: 'quota exceeded' }) }),
    )
    expect(model.saveStatus).toEqual({
      _tag: 'failed',
      error: new StoreError({ message: 'quota exceeded' }),
    })
    expect(commands).toEqual([])
    expect(Option.isNone(out)).toBe(true)
  })

  it('ImageDecoded records the picked bytes as an unattached source record', () => {
    const [model] = update(
      { ...initialModel(), phase: Loading() },
      EditorMessage.ImageDecoded({ bitmap: bitmap(), height: 480, source: source(), width: 640 }),
    )
    expect(model.attachedEdit).toEqual({ id: null, source: source() })
    expect(model.saveStatus).toEqual({ _tag: 'idle' })
  })

  it('EditLoaded records the stored id + source bytes as the attachment', () => {
    const [model] = update(
      initialModel(),
      EditorMessage.EditLoaded({
        bitmap: bitmap(),
        chain: [],
        height: 480,
        id: id(),
        source: source(),
        width: 640,
      }),
    )
    expect(model.attachedEdit).toEqual({ id: id(), source: source() })
    expect(model.saveStatus).toEqual({ _tag: 'idle' })
  })

  it('ClearedImage drops the attachment and resets the save status', () => {
    const [model] = update(loaded({ id: id(), source: source() }), EditorMessage.ClearedImage())
    expect(model.attachedEdit).toBeNull()
    expect(model.saveStatus).toEqual({ _tag: 'idle' })
  })
})

const config = {
  update,
  view,
} as const

// The canvas stage mounts these when an image is showing; resolve them so the
// scene ends cleanly (as in file-picker.test.ts).
const settleCanvasMounts = [
  Mount.resolve(PanZoom, { _tag: 'ScaledCanvas', offsetX: 0, offsetY: 0, scale: 1 }),
  Mount.resolve(RegisterCanvas, { _tag: 'CanvasRegistered' }),
] as const

describe('editor: top bar save controls', () => {
  it('renders Save / Save as and dispatches SaveEdit on click, then shows the saved time', () => {
    scene(
      config,
      given(loaded({ id: id(), source: source() })),
      ...settleCanvasMounts,
      sceneExpect(text('Save')).toExist(),
      // The button's accessible name comes from its aria-label (the visible
      // label is a CSS-hidable span — docs/adr/0010-editor-ui.md).
      sceneExpect(role('button', { name: 'Save as a new edit' })).toExist(),
      click(text('Save')),
      // The button flips to Saving… while the command is in flight.
      sceneExpect(text('Saving…')).toExist(),
      SceneCommand.expectHas(SaveEdit),
      SceneCommand.resolve(SaveEdit, EditorMessage.EditSaved({ id: id(), savedAt: 1234 })),
      // The top bar shows the last save's time; an in-place save emits no
      // OutMessage (the URL already addresses the Edit).
      sceneExpect(text('Saved', { exact: false })).toExist(),
      SceneCommand.expectNone(),
    )
  })

  it('Save as stays disabled without an attached Edit; Save stays enabled (it creates)', () => {
    scene(
      config,
      given(loaded({ id: null, source: source() })),
      ...settleCanvasMounts,
      sceneExpect(role('button', { name: 'Save as a new edit' })).toBeDisabled(),
      sceneExpect(text('Save')).toBeEnabled(),
      SceneCommand.expectNone(),
    )
  })

  it('both buttons are disabled while a save is in flight', () => {
    scene(
      config,
      given({ ...loaded({ id: id(), source: source() }), saveStatus: { _tag: 'saving' } as const }),
      ...settleCanvasMounts,
      // The Save button shows the in-flight label; both are disabled.
      sceneExpect(text('Saving…')).toBeDisabled(),
      sceneExpect(role('button', { name: 'Save as a new edit' })).toBeDisabled(),
      SceneCommand.expectNone(),
    )
  })

  it('a Save as click surfaces EditCreated for the root', () => {
    scene(
      config,
      given(loaded({ id: id(), source: source() })),
      ...settleCanvasMounts,
      click(role('button', { name: 'Save as a new edit' })),
      SceneCommand.expectHas(SaveEdit),
      SceneCommand.resolve(SaveEdit, EditorMessage.EditSaved({ id: otherId(), savedAt: 1234 })),
      sceneExpect(text('Saved', { exact: false })).toExist(),
      expectOutMessage(EditorOutMessage.EditCreated({ id: otherId() })),
      SceneCommand.expectNone(),
    )
  })
})
