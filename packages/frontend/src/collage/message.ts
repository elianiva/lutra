import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { Collage, EditSummary, StoreError } from '@lutra/store'

/**
 * The Collage Submodel's message union (docs/adr/0009). Internal to the
 * collage — the root sees them wrapped as `GotCollageMessage`. The collage
 * surfaces no navigation facts to the root: its back button and the
 * bare-route redirect push URLs through commands directly.
 */

// ---- load ----
/**
 * The requested collage landed, pruned of dangling references. `dropped` is
 * how many tiles referenced edits that no longer exist; `thumbs` carries the
 * preview bytes for the surviving tiles.
 */
export const CollageLoaded = Message.m('CollageLoaded', {
  collage: Collage,
  thumbs: S.Array(EditSummary),
  dropped: S.Number,
})
/** The store failed the load (backend unavailable, quota, corruption). */
export const LoadFailed = Message.m('LoadFailed', { error: StoreError })
/** The id is well-formed but no such collage exists (deleted elsewhere). */
export const CollageMissing = Message.m('CollageMissing')

// ---- arrangement (auto-saves on every mutation, docs/adr/0030) ----
export const ChangedColumns = Message.m('ChangedColumns', { columns: S.Number })
export const ChangedGutter = Message.m('ChangedGutter', { gutter: S.Number })
export const ToggledBackground = Message.m('ToggledBackground')
export const RemovedTile = Message.m('RemovedTile', { index: S.Number })
export const MovedTile = Message.m('MovedTile', { from: S.Number, to: S.Number })

// ---- auto-save ----
/** The mutated record persisted. Observability only. */
export const CollageSaved = Message.m('CollageSaved')
export const SaveFailed = Message.m('SaveFailed', { error: StoreError })

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
  ChangedColumns,
  ChangedGutter,
  ToggledBackground,
  RemovedTile,
  MovedTile,
  CollageSaved,
  SaveFailed,
  BackRequested,
  NavigatedBack,
])
export type CollageMessage = typeof CollageMessage.Type
