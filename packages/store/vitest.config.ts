import path from 'node:path'
import { defineConfig } from 'vitest/config'

const here = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      '@lutra/engine': path.resolve(here, '../engine/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/vitest-setup.ts'],
  },
})
