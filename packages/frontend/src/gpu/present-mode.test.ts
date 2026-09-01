import { describe, it, expect } from 'vitest'
import { presentModeToWgsl, WgslPresent } from './present-mode'

describe('presentModeToWgsl', () => {
  it('maps off to Graded', () => {
    expect(presentModeToWgsl({ mode: 'off', showBefore: false, splitAt: 0 })).toBe(WgslPresent.Graded)
    expect(presentModeToWgsl({ mode: 'off', showBefore: true, splitAt: 0.5 })).toBe(WgslPresent.Graded)
  })
  it('maps toggle with showBefore', () => {
    expect(presentModeToWgsl({ mode: 'toggle', showBefore: true, splitAt: 0 })).toBe(WgslPresent.Source)
    expect(presentModeToWgsl({ mode: 'toggle', showBefore: false, splitAt: 0 })).toBe(WgslPresent.Graded)
  })
  it('maps split to Split', () => {
    expect(presentModeToWgsl({ mode: 'split', showBefore: false, splitAt: 0.3 })).toBe(WgslPresent.Split)
    expect(presentModeToWgsl({ mode: 'split', showBefore: true, splitAt: 0.3 })).toBe(WgslPresent.Split)
  })
  it('maps side-by-side to SideBySide', () => {
    expect(presentModeToWgsl({ mode: 'side-by-side', showBefore: false, splitAt: 0 })).toBe(
      WgslPresent.SideBySide,
    )
  })
})
