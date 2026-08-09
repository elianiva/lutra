import { describe, it, expect } from 'vitest'
import {
  Idle,
  Filling,
  Paused,
  Ready,
  QuotaError,
  offlineMachine,
  type OfflinePhase,
} from './machine'
import type { RootMessage } from '../root/message'
import {
  OfflineFillStarted,
  OfflineFillPaused,
  OfflineFillResumed,
  OfflineFillComplete,
  OfflineQuotaError,
  ConnectivityChanged,
} from './messages'

// The offline fill machine's transition table (docs/adr/0015), asserted the
// same way the editor phase machine is (phase.test.ts): the states a message
// can land in are exactly the edges below, and messages with no edge are
// ignored — that absence IS the blocking (a Ready fill ignores everything; a
// paused fill ignores a second pause).

const step = (state: OfflinePhase, message: RootMessage) =>
  offlineMachine.step(state, message)

describe('offline machine', () => {
  it('starts Idle', () => {
    expect(offlineMachine.initial).toEqual(Idle())
  })

  it('a run beginning leaves Idle for Filling', () => {
    const result = step(Idle(), OfflineFillStarted({ total: 593, done: 0 }))
    expect(result._tag).toBe('Transitioned')
    expect(result.state).toEqual(Filling())
  })

  it('completing the run reaches Ready', () => {
    const result = step(Filling(), OfflineFillComplete())
    expect(result._tag).toBe('Transitioned')
    expect(result.state).toEqual(Ready())
  })

  it('the network dropping pauses a Filling run', () => {
    const result = step(Filling(), ConnectivityChanged({ online: false }))
    expect(result._tag).toBe('Transitioned')
    expect(result.state).toEqual(Paused())
  })

  it('the loop noticing the drop itself pauses too', () => {
    const result = step(Filling(), OfflineFillPaused())
    expect(result.state).toEqual(Paused())
  })

  it('an online event does NOT unpause — only the loop resumes itself', () => {
    // The loop announces FillResumed once it sees the connection again; the
    // browser's online event alone must not race it.
    const result = step(Paused(), ConnectivityChanged({ online: true }))
    expect(result._tag).toBe('Ignored')
    expect(result.state).toEqual(Paused())
  })

  it('the loop resuming returns to Filling', () => {
    const result = step(Paused(), OfflineFillResumed())
    expect(result.state).toEqual(Filling())
  })

  it('quota stops the run into QuotaError from Filling or Paused', () => {
    expect(step(Filling(), OfflineQuotaError({ message: 'full' })).state).toEqual(QuotaError())
    expect(step(Paused(), OfflineQuotaError({ message: 'full' })).state).toEqual(QuotaError())
  })

  it('a persist-retry run leaves QuotaError via Started', () => {
    const result = step(QuotaError(), OfflineFillStarted({ total: 593, done: 0 }))
    expect(result.state).toEqual(Filling())
  })

  it('Ready ignores everything, including a second completion', () => {
    const result = step(Ready(), OfflineFillComplete())
    expect(result._tag).toBe('Ignored')
    expect(result.state).toEqual(Ready())
  })

  it('Idle ignores file events and offline flips', () => {
    expect(step(Idle(), ConnectivityChanged({ online: false })).state).toEqual(Idle())
    expect(step(Idle(), OfflineFillPaused()).state).toEqual(Idle())
  })

  it('has no unreachable states or dead transitions', () => {
    expect(offlineMachine.unreachableStates()).toEqual([])
    expect(offlineMachine.deadTransitions()).toEqual([])
  })
})
