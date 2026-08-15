import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [foldkit({ devToolsMcpPort: 9988 }), tailwindcss()],
  resolve: {
    alias: {
      // The engine and store have no build step — consume them as TS source so
      // the frontend dev/build resolves directly into the workspace packages.
      '@lutra/engine': path.resolve(here, '../engine/src/index.ts'),
      '@lutra/store': path.resolve(here, '../store/src/index.ts'),
    },
  },
  optimizeDeps: {
    entries: ['src/entry.ts'],
    // NOTE: @lutra/engine is intentionally NOT in `include`. It is a
    // build-less workspace package aliased to its TS source above, so
    // Vite transforms it on the fly. Pre-bundling it here would cache a
    // stale copy in node_modules/.vite and the dev server would keep
    // serving outdated engine code after edits (the `optimizeDeps.include`
    // cache does not reliably re-optimize when files inside a linked
    // package change).
  },
})
