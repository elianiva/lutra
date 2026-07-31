import { Schema } from 'effect'
import { Route } from 'foldkit'

// The app is a single editor screen. The route exists so the URL bar and back
// button still behave naturally and so adding a gallery/landing route later
// is a one-line change rather than a re-architecture: see Future in context.md.

export const EditorRoute = Route.r('EditorRoute')
export const NotFoundRoute = Route.r('NotFoundRoute', { path: Schema.String })

export const AppRoute = Schema.Union([EditorRoute, NotFoundRoute])
export type AppRoute = typeof AppRoute.Type

export const editorRouter = Route.mapTo(EditorRoute)(Route.root)
export const parseRoute = Route.parseUrlWithFallback(editorRouter, NotFoundRoute)