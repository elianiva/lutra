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
      // The engine has no build step — consume it as TS source so the
      // frontend dev/build resolves directly into the workspace package.
      '@lutra/engine': path.resolve(here, '../engine/src/index.ts'),
    },
  },
  optimizeDeps: {
    entries: ['src/entry.ts'],
    include: ['@lutra/engine'],
  },
})