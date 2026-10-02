import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { EditIdSchema } from '@lutra/store'

// The app is two screens behind two route arms, each owned by a Submodel
// (docs/adr/0006-frontend-architecture): the Gallery (the main menu, `/`) and
// the Editor (`/edit/:editId`, opened from a gallery tile).
//
//   Gallery = "/"           → Gallery submodel
//   Editor  = "/edit/:editId" → Editor submodel (editId decoded through
//                              EditIdSchema so a malformed id swallows the
//                              whole route → NotFound)
//   NotFound = anything else → NotFound fallback

export const AppRoute = Route.defineRouteUnion({
  Gallery: {},
  Editor: { editId: EditIdSchema },
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

/** The gallery (main menu): the app's entry point. */
export const GalleryRoute = AppRoute.Gallery
/** The editor, attached to one Edit by id. */
export const EditorRoute = AppRoute.Editor
export const NotFoundRoute = AppRoute.NotFound

export type GalleryRoute = typeof GalleryRoute.Type
export type EditorRoute = typeof EditorRoute.Type
export type NotFoundRoute = typeof NotFoundRoute.Type

const galleryRouter = pipe(Route.root, Route.mapTo(GalleryRoute))
const editorRouter = pipe(
  Route.literal('edit'),
  Route.slash(Route.schemaSegment('editId', EditIdSchema)),
  Route.mapTo(EditorRoute),
)
const router = Route.oneOf(editorRouter, galleryRouter)

/** Parse a URL into an AppRoute; anything unmatched falls back to NotFound. */
export const parseRoute = Route.parseUrlWithFallback(router, NotFoundRoute)
