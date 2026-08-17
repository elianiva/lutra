import path from 'node:path'
import { defineConfig } from 'vitest/config'

const here = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      '@lutra/engine': path.resolve(here, '../engine/src/index.ts'),
      '@lutra/store': path.resolve(here, '../store/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@foldkit/ui', '@foldkit/devtools'],
      },
    },
    setupFiles: ['./src/vitest-setup.ts'],
  },
})
