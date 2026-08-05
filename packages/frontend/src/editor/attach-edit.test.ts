import { describe, it, expect } from 'vitest'
import { MockImageBitmap } from '../vitest-setup'
import { EditId } from '@lutra/store'
import { initialModel } from './model'
import { update } from './update'
import { init } from './init'
import { informRouteChanged } from './inform-route-changed'
import { createLayerFor } from './command'
import { EditLoaded, EditLoadFailed } from './message'
import { Idle } from './phase'

// ---- helpers ----

const id = () => EditId('11111111-1111-4111-8111-111111111111')
const bitmap = (width = 640, height = 480) => new MockImageBitmap(width, height)
const editorRoute = { _tag: 'Editor', editId: id() } as const

// ---- tests ----

describe('attached edit load (gallery → /edit/:id)', () => {
  it('init fires LoadEdit when the boot route attaches an Edit', () => {
    const [, commands] = init(editorRoute)
    const names = commands.map((c) => c.name)
    expect(names).toContain('LoadEdit')
    expect(names).toContain('LoadCatalog')
    expect(names).toContain('LoadExportSettings')
  })

  it('init does not fire LoadEdit when the boot route is the gallery', () => {
    const [, commands] = init({ _tag: 'Gallery' })
    expect(commands.map((c) => c.name)).not.toContain('LoadEdit')
  })

  it('informRouteChanged re-fires LoadEdit for a route change onto an Edit', () => {
    const [, commands] = informRouteChanged(initialModel(), editorRoute)
    expect(commands.map((c) => c.name)).toContain('LoadEdit')
  })

  it('EditLoaded seeds the chain + source bitmap and lands Idle, then renders', () => {
    const exposure = createLayerFor('exposure')
    const [model, commands] = update(
      initialModel(),
      EditLoaded({
        id: id(),
        chain: [exposure],
        bitmap: bitmap(),
        width: 640,
        height: 480,
        source: new Uint8Array([9, 9]),
      }),
    )

    // The machine landed in Idle (the opened-Edit phase), never a new phase.
    expect(model.phase._tag).toBe('Idle')
    expect(model.source.bitmap).toBeInstanceOf(MockImageBitmap)
    expect(model.source.width).toBe(640)
    expect(model.source.height).toBe(480)
    expect(model.source.error).toBeNull()
    expect(model.chain).toEqual([exposure])
    // The loaded Edit's identity + stored bytes become the attachment.
    expect(model.attachedEdit).toEqual({ id: id(), source: new Uint8Array([9, 9]) })
    // The loaded edit is rendered immediately (renderNow), like a fresh pick.
    expect(commands[0]!.name).toBe('RenderChain')
  })

  it('EditLoaded discards an active draft when a different edit attaches', () => {
    // A loaded editor with a draft in flight…
    const withDraft = {
      ...initialModel(),
      phase: Idle(),
      source: { bitmap: bitmap(), width: 640, height: 480, error: null },
    }
    const [drafting] = update(withDraft, { _tag: 'SelectedTool', type: 'exposure' })
    expect(drafting.phase._tag).toBe('Drafting')

    // …is discarded when EditLoaded lands (the machine edge Drafting → Idle).
    const [model] = update(
      drafting,
      EditLoaded({
        id: id(),
        chain: [],
        bitmap: bitmap(),
        width: 640,
        height: 480,
        source: new Uint8Array([9, 9]),
      }),
    )
    expect(model.phase._tag).toBe('Idle')
    expect(model.chain).toEqual([])
    expect(model.attachedEdit).toEqual({ id: id(), source: new Uint8Array([9, 9]) })
  })

  it('EditLoadFailed lands the error stage with the reason', () => {
    const [model, commands] = update(initialModel(), EditLoadFailed({ error: 'edit not found' }))
    expect(model.phase._tag).toBe('Error')
    expect(model.source.error).toBe('edit not found')
    expect(commands).toEqual([])
  })
})
