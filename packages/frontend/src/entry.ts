import '@fontsource/electrolize'
import './styles.css'
import { Effect } from 'effect'
import { Runtime } from 'foldkit'
import { application } from './main'

// The service worker (docs/adr/0007-offline): prod-only — a SW in `vite dev` is a
// stale-cache footgun (you'd be debugging ghosts). `updateViaCache: 'none'`
// bypasses the HTTP cache for the SW script itself, so a deploy's new sw.js
// is picked up on the next navigation; the versioned shell cache + the
// precache diff handle the rest.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((error) => {
    // A failed registration (blocked storage, sandboxed context, a broken
    // origin) silently disables offline — surface it once through Effect's
    // logger instead of an unhandled rejection. The app degrades to
    // online-only gracefully.
    void Effect.runFork(
      Effect.logError('[service worker] registration failed — offline support disabled', error),
    )
  })
}

Runtime.run(application)
