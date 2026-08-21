import { Match as M, Option } from 'effect'
import type { Command } from 'foldkit'
import type { CollageStore } from '@lutra/store'
import { StoreError as StoreErrorClass } from '@lutra/store'
import type { CollageMessage } from './message'
import { NavigateMenu } from './command'
import type { Model } from './model'
import { loadedCollage } from './model'

export type UpdateReturn = readonly [
  Model,
  readonly Command.Command<CollageMessage, never, CollageStore>[],
  Option.Option<never>,
]

/**
 * The Collage Submodel's update loop (docs/adr/0009): the same
 * `[Model, Commands, Option<OutMessage>]` 3-tuple shape as the gallery and
 * editor. The collage surfaces no OutMessage facts yet, so the third slot is
 * always `Option.none()`.
 */
export const update = (model: Model, message: CollageMessage): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tags({
      CollageLoaded: ({ collage }) => [
        { ...model, collage: loadedCollage.Success({ data: collage }), notice: null },
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

      BackRequested: () => [model, [NavigateMenu()], Option.none()],
      // Observability only — the URL change drives the route transition.
      NavigatedBack: () => [model, [], Option.none()],
    }),
    M.exhaustive,
  )
