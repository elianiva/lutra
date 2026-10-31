import { Schema as S } from 'effect'

/**
 * The Landing Submodel's model (docs/adr/0015-landing): the demo workbench
 * state. Nothing here is persisted except the appearance mode — the landing
 * page is a stage for the app's real components, not a second editor.
 */
export const Category = S.Literals(['Negative', 'Black & white', 'Slide', 'Instant'])

export const Model = S.Struct({
  category: Category,
  /** Index into FILMS. */
  film: S.Number,
  /** 0 = the plain photo, 100 = the full film look. */
  strength: S.Number,
  grain: S.Boolean,
  vignette: S.Boolean,
})
export type Model = typeof Model.Type

export const NEUTRAL = { strength: 100 } as const

export const initialModel = (): Model => ({
  category: 'Negative',
  film: 0,
  ...NEUTRAL,
  grain: true,
  vignette: false,
})
