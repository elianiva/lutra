import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { AppRoute } from '../route'
import { LayerId, type LayerType } from '@lutra/engine'
import type { UrlRequest } from 'foldkit/navigation'

export const ChangedRoute = Message.m('ChangedRoute', { route: AppRoute })
export const Navigated = Message.m('Navigated', { request: S.Unknown })

const ImageStatus = S.Literals(['empty', 'loading', 'loaded', 'error'] as const)
export type ImageStatus = typeof ImageStatus.Type

// A decoded source bitmap plus its pixel size. The bitmap is held in the model
// as a plain ImageBitmap (`instanceOf` bypasses structural validation) so the
// render command can hand it to WebGPU without re-decoding.
export const SourceImage = S.Struct({
  status: ImageStatus,
  bitmap: S.NullOr(S.instanceOf(ImageBitmap)),
  width: S.Number,
  height: S.Number,
  error: S.NullOr(S.String),
})
export type SourceImage = typeof SourceImage.Type

export const FilePickRequested = Message.m('FilePickRequested')
export const FilePickCancelled = Message.m('FilePickCancelled')

export const SelectedImageFile = Message.m('SelectedImageFile', {
  file: S.instanceOf(File),
})
export const ImageDecoded = Message.m('ImageDecoded', {
  bitmap: S.instanceOf(ImageBitmap),
  width: S.Number,
  height: S.Number,
})
export const ImageFailedToDecode = Message.m('ImageFailedToDecode', {
  error: S.String,
})
export const ClearedImage = Message.m('ClearedImage')

// ---- canvas interaction ----

export const ScaledCanvas = Message.m('ScaledCanvas', {
  scale: S.Number,
  // Pan offset in canvas pixels.
  offsetX: S.Number,
  offsetY: S.Number,
})

// ---- tool panel / draft lifecycle ----

export const SelectedTool = Message.m('SelectedTool', { type: S.String })
export const ConfirmedDraft = Message.m('ConfirmedDraft')
export const CancelledDraft = Message.m('CancelledDraft')
export const UpdatedDraftParam = Message.m('UpdatedDraftParam', {
  field: S.String,
  value: S.Number,
})

// ---- committed chain ----

export const SelectedLayer = Message.m('SelectedLayer', { id: S.NullOr(LayerId) })
export const RemovedLayer = Message.m('RemovedLayer', { id: LayerId })
export const ReorderedLayer = Message.m('ReorderedLayer', {
  from: S.Number,
  to: S.Number,
})
export const ToggledLayerVisibility = Message.m('ToggledLayerVisibility', {
  id: LayerId,
})
export const UpdatedLayerParam = Message.m('UpdatedLayerParam', {
  id: LayerId,
  field: S.String,
  value: S.Number,
})
/** For toggled layers (White Balance, Vignette): cycle the active field shown in the drawer. */
export const CycledToggledField = Message.m('CycledToggledField', { id: LayerId })

// ---- layer drawer reorder (drag) ----

export const StartedLayerReorder = Message.m('StartedLayerReorder', { id: LayerId })
export const MovedLayerReorder = Message.m('MovedLayerReorder', { over: S.Number })

// ---- rendering ----

// The rendered frame is presented directly to the canvas by the GPU backend;
// the message only carries the model revision it was rendered for, so update
// can drop (or re-trigger) renders that arrived after a newer mutation.
export const RenderedFrame = Message.m('RenderedFrame', {
  stamp: S.Number,
})
export const RenderFailed = Message.m('RenderFailed', { reason: S.String })

// ---- export ----

export const ExportRequested = Message.m('ExportRequested')
export const ExportFinished = Message.m('ExportFinished', { url: S.String })
export const ExportFailed = Message.m('ExportFailed', { reason: S.String })

export const AppMessage = S.Union([
  ChangedRoute,
  Navigated,
  FilePickRequested,
  FilePickCancelled,
  SelectedImageFile,
  ImageDecoded,
  ImageFailedToDecode,
  ClearedImage,
  ScaledCanvas,
  SelectedTool,
  ConfirmedDraft,
  CancelledDraft,
  UpdatedDraftParam,
  SelectedLayer,
  RemovedLayer,
  ReorderedLayer,
  ToggledLayerVisibility,
  UpdatedLayerParam,
  CycledToggledField,
  StartedLayerReorder,
  MovedLayerReorder,
  RenderedFrame,
  RenderFailed,
  ExportRequested,
  ExportFinished,
  ExportFailed,
])
export type AppMessage = typeof AppMessage.Type

export { Layer, type LayerType } from '@lutra/engine'
