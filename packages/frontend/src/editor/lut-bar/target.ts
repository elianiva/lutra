import { Array, Match, Option, pipe, Schema as S } from 'effect'
import { LutLayer } from '@lutra/engine'
import type { LayerId, LutId } from '@lutra/engine'
import type { Model } from '../model'
import { Drafting, Selected } from '../phase'

/**
 * The LUT the bottom bar previews and commits to: the drafting LUT layer
 * (`{ kind: 'draft' }`) or the focused chain LUT layer (`{ kind: 'layer' }`).
 * `Option.none` when no LUT target exists. The bar's visibility rule is
 * `lutBarOpen && catalog !== null && Option.isSome(lutTarget(model))`; update
 * also gates `PreviewedLut` and `ToggledLutPicker` on a present target.
 * Extracted from the inline checks the drawer picker era kept in update.ts.
 */
export type LutTarget =
  | { readonly kind: 'draft' }
  | { readonly kind: 'layer'; readonly id: LayerId }

export const lutTarget = (phase: Model['phase'], chain: Model['chain']) =>
  Match.value(phase).pipe(
    Match.withReturnType<Option.Option<LutTarget>>(),
    Match.when(S.is(Drafting), (phase) =>
      pipe(Option.some(phase.layer), Option.filter(S.is(LutLayer)), Option.as({ kind: 'draft' })),
    ),
    Match.when(S.is(Selected), (selected) =>
      pipe(
        chain,
        Array.findFirst((layer) => layer.id === selected.layerId),
        Option.filter(S.is(LutLayer)),
        Option.map((layer) => ({ id: layer.id, kind: 'layer' })),
      ),
    ),
    Match.orElse(() => Option.none()),
  )

/** The target's current lutId — the accent border and the name line. The
 *  `Option.none` branch is unreachable from the bar (the caller verified the
 *  target exists, so the phase/chain still carries the lut layer), but the
 *  type-checker can't see that invariant — the callers treat it as optional
 *  instead of fabricating a `catalog[0]` fallback. */
export const currentLutId = (phase: Model['phase'], chain: Model['chain'], target: LutTarget) =>
  Match.value(target).pipe(
    Match.withReturnType<Option.Option<LutId>>(),
    Match.when({ kind: 'draft' }, () =>
      pipe(
        Option.some(phase),
        Option.filter(S.is(Drafting)),
        Option.flatMap((drafting) =>
          pipe(
            Option.some(drafting.layer),
            Option.filter(S.is(LutLayer)),
            Option.map((layer) => layer.lutId),
          ),
        ),
      ),
    ),
    Match.when({ kind: 'layer' }, ({ id }) =>
      pipe(
        chain,
        Array.findFirst((layer) => layer.id === id),
        Option.filter(S.is(LutLayer)),
        Option.map((layer) => layer.lutId),
      ),
    ),
    Match.orElse(() => Option.none()),
  )
