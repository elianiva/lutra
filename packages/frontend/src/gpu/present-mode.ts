export interface ComparePresent {
  readonly mode: 'off' | 'toggle' | 'split' | 'side-by-side'
  readonly splitAt: number
  readonly showBefore: boolean
}

export const WgslPresent = {
  Graded: 0,
  Source: 1,
  Split: 2,
  SideBySide: 3,
} as const

export type WgslPresent = (typeof WgslPresent)[keyof typeof WgslPresent]

export const presentModeToWgsl = (present: ComparePresent): WgslPresent => {
  switch (present.mode) {
    case 'off':
      return WgslPresent.Graded
    case 'toggle':
      return present.showBefore ? WgslPresent.Source : WgslPresent.Graded
    case 'split':
      return WgslPresent.Split
    case 'side-by-side':
      return WgslPresent.SideBySide
    default: {
      const exhaustive: never = present.mode
      return exhaustive
    }
  }
}
