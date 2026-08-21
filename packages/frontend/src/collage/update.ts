import { Match as M, Option } from 'effect'
import type { Command } from 'foldkit'
import type { Collage, CollageStore, EditStore } from '@lutra/store'
import { StoreError as StoreErrorClass } from '@lutra/store'
import type { CollageMessage } from './message'
import { LoadCollage, NavigateMenu, SaveCollage } from './command'
import type { Model } from './model'
import { loadedCollage } from './model'
import { moveTile, removeTile } from './tiles'

export type UpdateReturn = readonly [
  Model,
  readonly Command.Command<CollageMessage, never, CollageStore | EditStore>[],
  Option.Option<never>,
]

/** Layout control bounds — the record stores plain numbers; the screen clamps. */
export const LAYOUT_BOUNDS = {
  minColumns: 2,
  maxColumns: 6,
  minGutter: 0,
  maxGutter: 32,
} as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Mutate the loaded collage's arrangement and queue an auto-save
 * (docs/adr/0030). Arrangement messages with no edge while nothing is loaded
 * are ignored — that IS the blocking, with no scattered guards.
 */
const mutate = (model: Model, f: (collage: Collage) => Collage): UpdateReturn => {
  if (model.collage._tag !== 'Success') {
    return [model, [], Option.none()]
  }
  const collage = f(model.collage.data)
  return [
    { ...model, collage: loadedCollage.Success({ data: collage }) },
    [SaveCollage({ collage })],
    Option.none(),
  ]
}

/**
 * The Collage Submodel's update loop (docs/adr/0009): the same
 * `[Model, Commands, Option<OutMessage>]` 3-tuple shape as the gallery and
 * editor. The collage surfaces no OutMessage facts, so the third slot is
 * always `Option.none()`.
 */
export const update = (model: Model, message: CollageMessage): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tags({
      CollageLoaded: ({ collage, thumbs, dropped }) => [
        {
          ...model,
          collage: loadedCollage.Success({ data: collage }),
          thumbs,
          notice:
            dropped > 0
              ? `${dropped} ${dropped === 1 ? 'photo' : 'photos'} removed — their edits were deleted`
              : null,
        },
        [],
        Option.none(),
      ],
      LoadFailed: ({ error }) => [
        { ...model, collage: loadedCollage.Failure({ error }) },
        [],
        Option.none(),
      ],
      // The id was well-formed but the record is gone: show the same failure
      // state with a plain-language reason (a synthetic StoreError carries
      // the message; there is no backend behind it).
      CollageMissing: () => [
        {
          ...model,
          collage: loadedCollage.Failure({
            error: new StoreErrorClass({ message: 'this collage does not exist' }),
          }),
        },
        [],
        Option.none(),
      ],

      // ---- arrangement (each mutation auto-saves) ----
      ChangedColumns: ({ columns }) =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            columns: clamp(Math.round(columns), LAYOUT_BOUNDS.minColumns, LAYOUT_BOUNDS.maxColumns),
          },
        })),
      ChangedGutter: ({ gutter }) =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            gutter: clamp(Math.round(gutter), LAYOUT_BOUNDS.minGutter, LAYOUT_BOUNDS.maxGutter),
          },
        })),
      ToggledBackground: () =>
        mutate(model, (c) => ({
          ...c,
          layout: { ...c.layout, background: c.layout.background === 'dark' ? 'light' : 'dark' },
        })),
      RemovedTile: ({ index }) => mutate(model, (c) => ({ ...c, tiles: removeTile(c.tiles, index) })),
      MovedTile: ({ from, to }) => mutate(model, (c) => ({ ...c, tiles: moveTile(c.tiles, from, to) })),

      // ---- auto-save ----
      CollageSaved: () => [model, [], Option.none()],
      SaveFailed: ({ error }) => [
        { ...model, notice: `Could not save the collage: ${error.message}` },
        [],
        Option.none(),
      ],

      BackRequested: () => [model, [NavigateMenu()], Option.none()],
      // Observability only — the URL change drives the route transition.
      NavigatedBack: () => [model, [], Option.none()],
    }),
    M.exhaustive,
  )
