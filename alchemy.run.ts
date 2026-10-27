import * as Alchemy from 'alchemy'
import * as Cloudflare from '@alchemy.run/cloudflare'
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
    // Deep links (`/edit/<id>`) have no asset on disk; the
    // asset layer must serve index.html so the client router boots instead of
    // 404ing. Without this every non-root URL breaks on a reload or a share.
    notFoundHandling: 'single-page-application',
  },
}) {}

// imgutils: the batch compressor and collage maker. A fixed worker name keeps
// it on its workers.dev URL, `imgutils.<account-subdomain>.workers.dev`. It
// reuses the engine's encoder and the editor's material tokens, so both are in
// the rebuild hash.
class Imgutils extends Cloudflare.Website.Vite<Imgutils>()('imgutils', {
  rootDir: 'packages/imgutils',
  name: 'imgutils',
  memo: {
    include: ['**/*', '../../packages/engine/src/**', '../../packages/frontend/src/materials.css'],
    lockfile: true,
  },
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
    const imgutils = yield* Imgutils

    return {
      url: website.url,
      imgutilsUrl: imgutils.url,
    }
  }),
)
