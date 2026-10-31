import { Match as M } from 'effect'
import type { Update } from 'foldkit'
import { FILMS, firstOf } from './films'
import { OpenPage } from './command'
import { Message } from './message'
import { NEUTRAL, type Model } from './model'

export type UpdateReturn = Update.Return<Model, Message, never>

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      // Switching shelf lands on that shelf's first film so the preview always changes.
      SelectedCategory: ({ category }) => ({
        model: { ...model, category, film: firstOf(category) },
      }),
      SelectedFilm: ({ index }) => ({
        model: {
          ...model,
          film: index,
          category: FILMS[index]?.category ?? model.category,
        },
      }),
      AdjustedStrength: ({ value }) => ({ model: { ...model, strength: value } }),
      ToggledGrain: () => ({ model: { ...model, grain: !model.grain } }),
      ToggledVignette: () => ({ model: { ...model, vignette: !model.vignette } }),
      ResetAdjustments: () => ({ model: { ...model, ...NEUTRAL } }),
      PageRequested: ({ page }) => ({ model, commands: [OpenPage({ page })] }),
      PageOpened: () => ({ model }),
    }),
  )
