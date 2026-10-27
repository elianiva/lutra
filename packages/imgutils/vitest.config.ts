import path from 'node:path'
import { defineConfig } from 'vitest/config'

const here = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      '@lutra/engine': path.resolve(here, '../engine/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@foldkit/ui'],
      },
    },
  },
})
