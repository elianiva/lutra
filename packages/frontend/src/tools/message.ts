import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Dialog from '@/components/ui/dialog'
import { CollageRatio } from './geometry'
import { Item, Result, Slot, Tab } from './model'
import { Settings } from './settings'

export const Message = defineMessageUnion({
  SelectedTab: { tab: Tab },
  ToggledMode: {},
  CompletedPersistMode: {},
  ToggledSettings: {},
  PageRequested: { page: S.Literals(['edits', 'tools']) },
  PageOpened: {},
  ChangedSettings: { settings: Settings },

  // Single mode
  AddRequested: {},
  PickCancelled: {},
  FilesDropped: { files: S.Array(S.instanceOf(File)) },
  DragEntered: {},
  DragLeft: {},
  ItemsPrepared: { items: S.Array(Item) },
  Processed: { id: S.Number, result: Result },
  ProcessFailed: { id: S.Number, error: S.String },
  ReprocessRequested: {},
  RetryRequested: { id: S.Number },
  ZipRequested: {},
  ZipSaved: {},
  ClearRequested: {},
  CompletedRevoke: {},

  // Before/after preview
  PreviewRequested: { id: S.Number },
  GotPreviewDialogMessage: { message: Dialog.Message },

  // Collage mode
  CollageAddRequested: {},
  CollageFilesChosen: { files: S.Array(S.instanceOf(File)) },
  SlotsPrepared: { slots: S.Array(Slot), failed: S.Number },
  ReplaceRequested: { index: S.Number },
  SlotReplaced: { index: S.Number, slot: S.NullOr(Slot) },
  ChangedRatio: { ratio: CollageRatio },
  ChangedGap: { gapPercent: S.Number },
  SelectedPreset: { id: S.String },
  ChangedGrid: { rows: S.Number, cols: S.Number },
  SelectedCell: { index: S.Number },
  RemovedCell: { index: S.Number },
  MovedSelected: { direction: S.Number },
  ShuffleRequested: {},
  Shuffled: { order: S.Array(S.Number) },
  CollageClearRequested: {},
  ChangedZoom: { zoom: S.Number },
  ChangedFocus: { fx: S.Number, fy: S.Number },
  ResetView: {},
  PressedCell: {
    index: S.Number,
    x: S.Number,
    y: S.Number,
    cellWidth: S.Number,
    cellHeight: S.Number,
  },
  MovedPointer: { x: S.Number, y: S.Number },
  ReleasedPointer: {},
  DragStartedCell: { index: S.Number },
  DroppedOnCell: { index: S.Number },
  CollageSaveRequested: {},
  CollageSaved: { width: S.Number, height: S.Number, size: S.Number, count: S.Number },
  CollageSaveFailed: { error: S.String },
})
export type Message = typeof Message.Type
