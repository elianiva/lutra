import { describe, it, expect, afterEach } from 'vitest'
import { Option } from 'effect'
import { Url } from 'foldkit'
import { init } from './init'
import { update } from './update'
import type { Model } from './model'
import { Filling, Paused, Ready, QuotaError, Idle } from '../offline/machine'
import {
  OfflineFillStarted,
  OfflineFileStarted,
  OfflineFileCompleted,
  OfflineFileFailed,
  OfflineFillPaused,
  OfflineFillResumed,
  OfflineFillComplete,
  OfflineQuotaError,
  ConnectivityChanged,
  OfflineFillRequested,
  StoragePersisted,
  OfflineReadyDismissed,
} from '../offline/messages'
import { LutId } from '@lutra/engine'

// The root's offline slice (docs/adr/0015): the machine steps here, the
// counters live here, and the per-file facts delegate into the editor
// Submodel — asserted end to end through the root's update.

const lutA = LutId('luts/print/kodak_2393_cuspclip.cube')

const galleryUrl = () => Option.getOrThrow(Url.fromString('https://lutra.test/'))

const galleryModel = (): Model => init(galleryUrl())[0]

const fillStarted = () => update(galleryModel(), OfflineFillStarted({ done: 7, total: 593 }))

describe('root: offline library', () => {
  afterEach(() => {
    // Restore any saveData stub.
    interface ConnectionHost {
      connection?: unknown
    }
    // SAFETY: navigator.connection is a non-standard extension; the stub checks for its presence to decide the offline posture.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    const nav = navigator as ConnectionHost
    delete nav.connection
  })

  it('init fires the auto-start command unless saveData is set', () => {
    const [, commands] = init(galleryUrl())
    expect(commands.map((c) => c.name)).toContain('StartOfflineFill')
  })

  it('init skips the auto-start on a saveData device', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    })
    const [, commands] = init(galleryUrl())
    expect(commands.map((c) => c.name)).not.toContain('StartOfflineFill')
  })

  it('a run beginning steps the machine to Filling and seeds the counters', () => {
    const [model] = fillStarted()
    expect(model.offline.phase).toEqual(Filling())
    expect(model.offline.total).toBe(593)
    expect(model.offline.downloaded).toBe(7)
  })

  it('a started cube file marks its LUT row fetching in the editor', () => {
    const [model] = fillStarted()
    const [next] = update(model, OfflineFileStarted({ lutId: lutA }))
    expect(next.editor.lutDownloads[lutA]).toBe('fetching')
  })

  it('a completed file bumps the counter and marks the row downloaded', () => {
    const [model] = fillStarted()
    const [next] = update(model, OfflineFileCompleted({ lutId: lutA }))
    expect(next.offline.downloaded).toBe(8)
    expect(next.editor.lutDownloads[lutA]).toBe('downloaded')
  })

  it('catalog/thumbnail files (null lutId) count but never touch the editor', () => {
    const [model] = fillStarted()
    const [next] = update(model, OfflineFileCompleted({ lutId: null }))
    expect(next.offline.downloaded).toBe(8)
    expect(next.editor.lutDownloads).toEqual({})
  })

  it('a failed file changes nothing — absence means not downloaded', () => {
    const [model] = fillStarted()
    const [next] = update(model, OfflineFileFailed({ lutId: lutA }))
    expect(next.offline.downloaded).toBe(7)
    expect(next.editor.lutDownloads).toEqual({})
  })

  it('completing the run reaches Ready, shows the toast, and starts its timer', () => {
    const [model] = fillStarted()
    const [next, commands] = update(model, OfflineFillComplete())
    expect(next.offline.phase).toEqual(Ready())
    expect(next.offline.readyToast).toBe(true)
    expect(commands.map((c) => c.name)).toContain('DismissOfflineToast')
  })

  it('the toast dismisses on demand', () => {
    const [model] = fillStarted()
    const [ready] = update(model, OfflineFillComplete())
    const [next] = update(ready, OfflineReadyDismissed())
    expect(next.offline.readyToast).toBe(false)
  })

  it('an offline flip pauses a Filling run and dims the editor', () => {
    const [model] = fillStarted()
    const [next] = update(model, ConnectivityChanged({ online: false }))
    expect(next.offline.phase).toEqual(Paused())
    expect(next.offline.online).toBe(false)
    expect(next.editor.online).toBe(false)
  })

  it('the loop pausing/resuming drives the machine itself', () => {
    const [model] = fillStarted()
    const [paused] = update(model, OfflineFillPaused())
    expect(paused.offline.phase).toEqual(Paused())
    const [resumed] = update(paused, OfflineFillResumed())
    expect(resumed.offline.phase).toEqual(Filling())
  })

  it('quota stops the run and fires the persist-retry command', () => {
    const [model] = fillStarted()
    const [next, commands] = update(model, OfflineQuotaError({ message: 'full' }))
    expect(next.offline.phase).toEqual(QuotaError())
    expect(commands.map((c) => c.name)).toContain('StartOfflineFill')
  })

  it('the manual start button dispatches the same start command', () => {
    const [model, commands] = update(galleryModel(), OfflineFillRequested())
    // The machine never races the loop: the request itself does not
    // transition — the run's own Started event does.
    expect(model.offline.phase).toEqual(Idle())
    expect(commands.map((c) => c.name)).toContain('StartOfflineFill')
  })

  it('the persist result is recorded', () => {
    const [model] = update(galleryModel(), StoragePersisted({ persisted: true }))
    expect(model.offline.persisted).toBe(true)
  })

  it('the machine ignores non-offline messages', () => {
    const [model] = fillStarted()
    // A random root message (ConnectivityChanged with online) has no edge
    // from Filling other than the offline direction — this one is ignored.
    const [next] = update(model, ConnectivityChanged({ online: true }))
    expect(next.offline.phase).toEqual(Filling())
  })
})
