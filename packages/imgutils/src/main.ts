import { Runtime } from 'foldkit'
import { Message } from './message'
import { Model, initialModel } from './model'
import { ImageWorkersLive } from './pipeline/pool'
import { applyMode, readMode } from './theme'
import { update } from './update'
import { view } from './view'

/**
 * imgutils: batch resize, frame and compress photos, or compose a collage.
 * Everything runs in this browser — decode, resize and encode happen in a
 * pool of workers; nothing is uploaded.
 */

// Paint the stored appearance before the first render, so boot never flashes.
const mode = readMode()
applyMode(mode)

export const application = Runtime.makeApplication({
  Model,
  container: document.querySelector('#root'),
  devTools: {
    Message,
    // Pointer moves during a pan would flood the history.
    excludeFromHistory: ['MovedPointer', 'DragEntered'],
    maxEntries: 60,
  },
  init: () => ({ model: initialModel(mode) }),
  resources: ImageWorkersLive,
  update,
  view,
})
