import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { Collage, StoreError } from '@lutra/store'

/**
 * The Collage Submodel's message union (docs/adr/0009). Internal to the
 * collage — the root sees them wrapped as `GotCollageMessage`. The collage
 * surfaces no navigation facts to the root yet: its back button and the
 * bare-route redirect push URLs through commands directly.
 */

// ---- load ----
/** The requested collage landed from the CollageStore. */
export const CollageLoaded = Message.m('CollageLoaded', { collage: Collage })
/** The store failed the load (backend unavailable, quota, corruption). */
export const LoadFailed = Message.m('LoadFailed', { error: StoreError })
/** The id is well-formed but no such collage exists (deleted elsewhere). */
export const CollageMissing = Message.m('CollageMissing')

// ---- navigation ----
/** The user pressed the back control; a command pushes the menu URL. */
export const BackRequested = Message.m('BackRequested')
/** The menu URL was pushed. Observability only — the URL change itself
 *  drives the route transition (mirrors the root's `NavigatedTo`). */
export const NavigatedBack = Message.m('NavigatedBack')

export const CollageMessage = S.Union([
  CollageLoaded,
  LoadFailed,
  CollageMissing,
  BackRequested,
  NavigatedBack,
])
export type CollageMessage = typeof CollageMessage.Type
