import { Schema as S } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import * as Dialog from '@/components/ui/dialog'
import { Adjust } from './collage/layout'
import { CollageRatio } from './geometry'
import { Settings, defaultSettings } from './settings'
import { Mode } from './theme'

/**
 * The imgutils model. Two modes share one settings record:
 *
 * - **Single** turns each dropped photo into one framed, compressed output.
 *   Every item walks a small machine: Working → Done | Failed. A settings
 *   change marks Done items stale; reprocessing sends them back to Working.
 * - **Collage** composes up to nine photos into one framed grid.
 */

export const Tab = S.Literals(['single', 'collage'])
export type Tab = typeof Tab.Type

export const Result = S.Struct({
  blob: S.instanceOf(Blob),
  url: S.String,
  width: S.Number,
  height: S.Number,
  sourceWidth: S.Number,
  sourceHeight: S.Number,
  /** The extension of the format it was encoded with. */
  extension: S.String,
})
export type Result = typeof Result.Type

export const ItemStatus = defineTaggedUnion({
  Working: {},
  Done: { result: Result, stale: S.Boolean },
  Failed: { error: S.String },
})
export type ItemStatus = typeof ItemStatus.Type

export const Item = S.Struct({
  id: S.Number,
  file: S.instanceOf(File),
  /** Object URL of the original, for the before/after preview. */
  sourceUrl: S.String,
  status: ItemStatus,
})
export type Item = typeof Item.Type

/** A photo placed in a collage cell. Width and height are the oriented size. */
export const Slot = S.Struct({
  key: S.Number,
  file: S.instanceOf(File),
  url: S.String,
  width: S.Number,
  height: S.Number,
  adjust: Adjust,
})
export type Slot = typeof Slot.Type

/** A pan gesture on the preview, measured from where it started. */
export const Pan = S.Struct({
  index: S.Number,
  startX: S.Number,
  startY: S.Number,
  cellWidth: S.Number,
  cellHeight: S.Number,
  start: Adjust,
})
export type Pan = typeof Pan.Type

export const Collage = S.Struct({
  ratio: CollageRatio,
  /** The active preset id, or `custom` for a hand-dialled grid. */
  presetId: S.String,
  rows: S.Number,
  cols: S.Number,
  gapPercent: S.Number,
  slots: S.Array(S.NullOr(Slot)),
  selected: S.Number,
  saving: S.Boolean,
  status: S.String,
  pan: S.NullOr(Pan),
  /** The cell a thumbnail drag started from. */
  dragFrom: S.NullOr(S.Number),
  nextKey: S.Number,
})
export type Collage = typeof Collage.Type

export const Model = S.Struct({
  tab: Tab,
  mode: Mode,
  settings: Settings,
  /** The settings panel is a disclosure below `lg`. */
  settingsOpen: S.Boolean,
  items: S.Array(Item),
  nextId: S.Number,
  zipping: S.Boolean,
  dragOver: S.Boolean,
  previewId: S.NullOr(S.Number),
  previewDialog: Dialog.Model,
  collage: Collage,
})
export type Model = typeof Model.Type

export const initialCollage: Collage = {
  ratio: '1:1',
  presetId: '4-grid',
  rows: 2,
  cols: 2,
  gapPercent: 2,
  slots: [null, null, null, null],
  selected: 0,
  saving: false,
  status: '',
  pan: null,
  dragFrom: null,
  nextKey: 0,
}

export const initialModel = (mode: Mode): Model => ({
  tab: 'single',
  mode,
  settings: defaultSettings,
  settingsOpen: false,
  items: [],
  nextId: 0,
  zipping: false,
  dragOver: false,
  previewId: null,
  previewDialog: Dialog.init({ id: 'preview-dialog' }),
  collage: initialCollage,
})
