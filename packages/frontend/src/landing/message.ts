import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Category } from './model'

export const Message = defineMessageUnion({
  SelectedCategory: { category: Category },
  SelectedFilm: { index: S.Number },
  AdjustedStrength: { value: S.Number },
  ToggledGrain: {},
  ToggledVignette: {},
  ResetAdjustments: {},
  PageRequested: { page: S.Literals(['edits', 'tools']) },
  PageOpened: {},
})
export type Message = typeof Message.Type
