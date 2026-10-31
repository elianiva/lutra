import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { EditIdSchema } from '@lutra/store'

// The site is a landing page plus the app behind four route arms, each owned
// by a Submodel (docs/adr/0006-frontend-architecture, docs/adr/0015-landing):
//
//   Landing = "/"                  → Landing submodel (marketing; no WebGPU needed)
//   Gallery = "/app"               → Gallery submodel (the app's main menu)
//   Editor  = "/app/edit/:editId"  → Editor submodel (editId decoded through
//                                    EditIdSchema so a malformed id swallows the
//                                    whole route → NotFound)
//   Tools = "/app/tools"           → Tools submodel (batch compressor, collage maker)
//   NotFound = anything else       → NotFound fallback

export const AppRoute = Route.defineRouteUnion({
  Landing: {},
  Gallery: {},
  Editor: { editId: EditIdSchema },
  Tools: {},
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

/** The landing page: the site's front door. */
export const LandingRoute = AppRoute.Landing
/** The gallery (main menu): the app's entry point. */
export const GalleryRoute = AppRoute.Gallery
/** The editor, attached to one Edit by id. */
export const EditorRoute = AppRoute.Editor
/** The tools: batch resize/compress and collage (docs/adr/0014-tools). */
export const ToolsRoute = AppRoute.Tools
export const NotFoundRoute = AppRoute.NotFound

export type LandingRoute = typeof LandingRoute.Type
export type GalleryRoute = typeof GalleryRoute.Type
export type EditorRoute = typeof EditorRoute.Type
export type ToolsRoute = typeof ToolsRoute.Type
export type NotFoundRoute = typeof NotFoundRoute.Type

const landingRouter = pipe(Route.root, Route.mapTo(LandingRoute))
const galleryRouter = pipe(Route.literal('app'), Route.mapTo(GalleryRoute))
const editorRouter = pipe(
  Route.literal('app'),
  Route.slash(Route.literal('edit')),
  Route.slash(Route.schemaSegment('editId', EditIdSchema)),
  Route.mapTo(EditorRoute),
)
const toolsRouter = pipe(
  Route.literal('app'),
  Route.slash(Route.literal('tools')),
  Route.mapTo(ToolsRoute),
)
const router = Route.oneOf(editorRouter, toolsRouter, galleryRouter, landingRouter)

/** Parse a URL into an AppRoute; anything unmatched falls back to NotFound. */
export const parseRoute = Route.parseUrlWithFallback(router, NotFoundRoute)
