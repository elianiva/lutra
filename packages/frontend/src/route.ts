import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { CollageIdSchema, EditIdSchema } from '@lutra/store'

// The app is three screens behind three route arms, each owned by a Submodel
// (docs/adr/0009): the Gallery (the main menu, `/`), the Editor
// (`/edit/:editId`, opened from a gallery tile), and the Collage screen
// (`/collage/:collageId`, opened from "Create collage" or a Collages tile).
//
//   Gallery = "/"                       → Gallery submodel
//   Editor  = "/edit/:editId"           → Editor submodel (editId decoded
//                                         through EditIdSchema so a malformed
//                                         id swallows the whole route → NotFound)
//   Collage = "/collage" | "/collage/:id" → Collage submodel; the bare form
//                                         carries a null id and the root
//                                         redirects home (collages are always
//                                         created persist-first from the menu,
//                                         so there is no "new collage" screen)
//   NotFound = anything else            → NotFound fallback

/** The gallery (main menu): the app's entry point. */
export const GalleryRoute = Route.r('Gallery')
/** The editor, attached to one Edit by id. */
export const EditorRoute = Route.r('Editor', { editId: EditIdSchema })
/**
 * The collage screen, attached to one Collage by id. foldkit's router has no
 * optional-segment combinator and its biparsers must typecheck in both
 * directions, so `/collage/:id` and the bare `/collage` are two route tags:
 * the bare form is a redirect home (collages are always created
 * persist-first from the menu — there is no "new collage" screen).
 */
export const CollageRoute = Route.r('Collage', { collageId: CollageIdSchema })
export const CollageHomeRoute = Route.r('CollageHome')
export const NotFoundRoute = Route.r('NotFound', { path: Schema.String })

export const AppRoute = Schema.Union([
  GalleryRoute,
  EditorRoute,
  CollageRoute,
  CollageHomeRoute,
  NotFoundRoute,
])
export type AppRoute = typeof AppRoute.Type

export type GalleryRoute = typeof GalleryRoute.Type
export type EditorRoute = typeof EditorRoute.Type
export type CollageRoute = typeof CollageRoute.Type
export type CollageHomeRoute = typeof CollageHomeRoute.Type
export type NotFoundRoute = typeof NotFoundRoute.Type

// ---- routers (biparsers) matching each route's URL ----

const galleryRouter = pipe(Route.root, Route.mapTo(GalleryRoute))
const editorRouter = pipe(
  Route.literal('edit'),
  Route.slash(Route.schemaSegment('editId', EditIdSchema)),
  Route.mapTo(EditorRoute),
)
const collageRouter = pipe(
  Route.literal('collage'),
  Route.slash(Route.schemaSegment('collageId', CollageIdSchema)),
  Route.mapTo(CollageRoute),
)
const bareCollageRouter = pipe(Route.literal('collage'), Route.mapTo(CollageHomeRoute))
const router = Route.oneOf(editorRouter, collageRouter, bareCollageRouter, galleryRouter)

/** Parse a URL into an AppRoute; anything unmatched falls back to NotFound. */
export const parseRoute = Route.parseUrlWithFallback(router, NotFoundRoute)
