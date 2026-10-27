import path from 'node:path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

const here = import.meta.dirname

export default defineConfig({
  optimizeDeps: {
    entries: ['src/entry.ts'],
    // The codec glue resolves its .wasm file with `new URL(..., import.meta.url)`,
    // which the dependency pre-bundler cannot rewrite.
    exclude: ['@jsquash/avif', '@jsquash/jpeg', '@jsquash/png', '@jsquash/resize', '@jsquash/webp'],
  },
  plugins: [foldkit(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      // The engine has no build step: consume its TS source, like the editor does.
      '@lutra/engine': path.resolve(here, '../engine/src/index.ts'),
    },
  },
  // The image worker lazy-loads each codec, which needs an ES module worker.
  worker: { format: 'es' },
})
