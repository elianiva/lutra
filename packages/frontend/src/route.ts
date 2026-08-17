import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { EditIdSchema } from '@lutra/store'

// The app is two screens behind two route arms, each owned by a Submodel
// (docs/adr/0009): the Gallery (the main menu, `/`) and the Editor
// (`/edit/:editId`, opened from a gallery tile).
//
//   Gallery = "/"                       → Gallery submodel
//   Editor  = "/edit/:editId"           → Editor submodel (editId decoded
//                                         through EditIdSchema so a malformed
//                                         id swallows the whole route → NotFound)
//   NotFound = anything else            → NotFound fallback

/** The gallery (main menu): the app's entry point. */
export const GalleryRoute = Route.r('Gallery')
/** The editor, attached to one Edit by id. */
export const EditorRoute = Route.r('Editor', { editId: EditIdSchema })
export const NotFoundRoute = Route.r('NotFound', { path: Schema.String })

export const AppRoute = Schema.Union([GalleryRoute, EditorRoute, NotFoundRoute])
export type AppRoute = typeof AppRoute.Type

export type GalleryRoute = typeof GalleryRoute.Type
export type EditorRoute = typeof EditorRoute.Type
export type NotFoundRoute = typeof NotFoundRoute.Type

// ---- routers (biparsers) matching each route's URL ----

const galleryRouter = pipe(Route.root, Route.mapTo(GalleryRoute))
const editorRouter = pipe(
  Route.literal('edit'),
  Route.slash(Route.schemaSegment('editId', EditIdSchema)),
  Route.mapTo(EditorRoute),
)
const router = Route.oneOf(editorRouter, galleryRouter)

/** Parse a URL into an AppRoute; anything unmatched falls back to NotFound. */
export const parseRoute = Route.parseUrlWithFallback(router, NotFoundRoute)
