import { describe, it } from 'vitest'
import {
  Command,
  Mount,
  click,
  given,
  role,
  scene,
  text,
  expect as sceneExpect,
} from 'foldkit/scene'
import { LutId } from '@lutra/engine'
import { MockImageBitmap } from '../../vitest-setup'
import { RenderHandle } from '../../gpu/backend'
import { initialModel } from '../model'
import { update } from '../update'
import { view } from '../view'
import { Idle } from '../phase'
import { selectTool } from '../test-layer'
import { EditorMessage } from '../message'
import { PanZoom, RegisterCanvas } from '../canvas-stage'
import { SaveLutRecents, RenderChain, ReadHistogram } from '../command'
import type { Catalog } from '../message'
import type { Model } from '../model'

// The LUT bar's offline library behavior (docs/adr/0007-offline): while the device
// is offline, an undownloaded cube's row is dimmed with a "not downloaded"
// badge and its click becomes the connect-once notice instead of a commit;
// a downloaded cube commits as usual — offline is exactly the point.

const lutPrint = LutId('luts/print/kodak_2393_cuspclip.cube')

const catalog: Catalog = [
  {
    category: 'Print',
    lut_file: lutPrint,
    name: 'Kodak 2393 Cuspclip',
    thumbnail: 'thumbnails/print/kodak_2393_cuspclip.jpg',
  },
]

// SAFETY: fabricated GPU handle stub — tests never execute GPU work, so only its type flows through the model; the buffer has no backing storage and is never read.
const stubHandle = () =>
  // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
  new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, state: { _tag: 'Idle' }, generation: 0 })

const config = { update, view } as const

// Mirrors lut-flow.test.ts's stageMounts: the canvas/pan-zoom/wheel mounts
// resolve so the scene ends cleanly.
const stageMounts = [
  Mount.resolve(PanZoom, { _tag: 'ScaledCanvas', offsetX: 0, offsetY: 0, scale: 1 }),
  Mount.resolve(RegisterCanvas, { _tag: 'CanvasRegistered' }),
]

const loaded = () => ({
  ...initialModel(),
  catalog,
  phase: Idle(),
  source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
})

const settled = (model: Model): Model =>
  update(model, EditorMessage.RenderedFrame({ handle: stubHandle(), stamp: model.revision })).model

/** A LUT draft with the bar open (the draft selects the first catalog entry). */
const lutDraft = () => settled(selectTool(loaded(), 'lut').model)

/** The same draft, but the device is offline. */
const offlineLutDraft = () =>
  update(lutDraft(), EditorMessage.OfflineConnectivityChanged({ online: false })).model

/** The same draft, offline, with the cube already in the offline library. */
const offlineLutDraftDownloaded = () =>
  update(offlineLutDraft(), EditorMessage.OfflineFileDownloaded({ lutId: lutPrint })).model

describe('LUT bar offline library', () => {
  it('an undownloaded cube while offline is dimmed with a badge', () => {
    scene(
      config,
      given(offlineLutDraft()),
      ...stageMounts,
      sceneExpect(
        role('button', {
          name: 'Apply Kodak 2393 Cuspclip — not downloaded, needs a connection',
        }),
      ).toExist(),
      sceneExpect(text('not downloaded', { exact: false })).toExist(),
    )
  })

  it('clicking an undownloaded cube offline shows the connect-once notice instead of committing', () => {
    scene(
      config,
      given(offlineLutDraft()),
      ...stageMounts,
      click(role('button', { name: /Apply Kodak 2393 Cuspclip/ })),
      // No chain mutation, no commands — the bar's name line carries the
      // distinct notice instead.
      Command.expectNone(),
      sceneExpect(
        text("isn't downloaded yet — connect once and the offline library finishes preparing", {
          exact: false,
        }),
      ).toExist(),
    )
  })

  it('a downloaded cube commits offline exactly as online (no notice)', () => {
    scene(
      config,
      given(offlineLutDraftDownloaded()),
      ...stageMounts,
      click(role('button', { name: /Apply Kodak 2393 Cuspclip/ })),
      // The commit went through (the notice path fires nothing): the render
      // + recents-save commands are dispatched — assert before resolving.
      Command.expectHas(SaveLutRecents({ recents: [lutPrint] })),
      Command.resolve(
        RenderChain,
        EditorMessage.RenderedFrame({ handle: stubHandle(), stamp: 999 }),
      ),
      Command.resolve(
        ReadHistogram,
        EditorMessage.HistogramComputed({ bins: new Uint32Array(256), stamp: 999 }),
      ),
      Command.resolve(SaveLutRecents, EditorMessage.LutRecentsSaved()),
      sceneExpect(text("isn't downloaded yet", { exact: false })).toBeAbsent(),
    )
  })

  it('while online the badge and notice never appear', () => {
    scene(
      config,
      given(lutDraft()),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Apply Kodak 2393 Cuspclip' })).toExist(),
      sceneExpect(text('not downloaded', { exact: false })).toBeAbsent(),
    )
  })
})
