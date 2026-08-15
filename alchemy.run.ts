import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

class Website extends Cloudflare.Website.Vite<Website>()('lutra', {
  // The vite app lives in the frontend workspace package. `memo` widens the
  // rebuild hash to the engine package too — the frontend consumes it as
  // build-less TS source via a resolve alias, so engine edits must
  // retrigger the deploy build (and `lockfile: true` keeps the lockfile in
  // the hash, since providing `include` otherwise drops it).
  rootDir: 'packages/frontend',
  memo: {
    include: ['**/*', '../../packages/engine/src/**'],
    lockfile: true,
  },
  domain: 'lutra.elianiva.com',
  assets: {
    runWorkerFirst: false,
  },
}) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>

export default Alchemy.Stack(
  'lutra',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* Website

    return {
      url: website.url,
    }
  }),
)
