import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { AppRoute } from '../route'
import * as Gallery from '../gallery/message'
import * as Editor from '../editor/message'
import * as Offline from '../offline/messages'
// The offline UI's own requests/acks, re-exported so root-owned views
// (the strip's start button, the toast) can dispatch them directly.
export { OfflineFillRequested, OfflineReadyDismissed } from '../offline/messages'

// The root orchestrated Submodel Messages (docs/adr/0009): routing facts the
// root owns (`ChangedRoute`, `Navigated`) plus the `Got*Message` wrappers that
// lift a child Submodel's Message into the root's message universe. The
// wrappers carry routing, not payload — any domain payload lives inside the
// child Message (submodel.md).

/** The resolved URL changed (browser back/forward, a pushed URL). */
export const ChangedRoute = Message.m('ChangedRoute', { route: AppRoute })
/** A link/click requested navigation. */
export const Navigated = Message.m('Navigated', { request: S.Unknown })

/** Wraps a Gallery Submodel Message so the root can delegate to `Gallery.update`. */
export const GotGalleryMessage = Message.m('GotGalleryMessage', { message: Gallery.GalleryMessage })
/** Wraps an Editor Submodel Message so the root can delegate to `Editor.update`. */
export const GotEditorMessage = Message.m('GotEditorMessage', { message: Editor.EditorMessage })

/** The root pushed `/edit/:id` in response to a Gallery `OpenedEdit` fact.
 *  Observability only — the URL change itself drives the route transition. */
export const NavigatedTo = Message.m('NavigatedTo')

export const RootMessage = S.Union([
  ChangedRoute,
  Navigated,
  GotGalleryMessage,
  GotEditorMessage,
  NavigatedTo,
  // The offline slice's universe (../offline/messages): the fill's bridged
  // events, the connectivity facts, and the UI's requests/acks. The root
  // owns the fill machine and forwards per-file facts into the editor.
  Offline.OfflineFillStarted,
  Offline.OfflineFileStarted,
  Offline.OfflineFileCompleted,
  Offline.OfflineFileFailed,
  Offline.OfflineFillPaused,
  Offline.OfflineFillResumed,
  Offline.OfflineFillComplete,
  Offline.OfflineQuotaError,
  Offline.ConnectivityChanged,
  Offline.OfflineFillRequested,
  Offline.StoragePersisted,
  Offline.OfflineReadyDismissed,
])
export type RootMessage = typeof RootMessage.Type
