import { Effect, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'
import { pageUrl } from '@/components/nav-pill'
import { Message } from './message'

/** Step into the app: a URL push the root turns into a route change. */
export const OpenPage = Command.define('LandingOpenPage', {
  args: { page: S.Literals(['edits', 'tools']) },
  execute: ({ page }) => pushUrl(pageUrl(page)).pipe(Effect.as(Message.PageOpened())),
  messages: [Message.PageOpened],
})
