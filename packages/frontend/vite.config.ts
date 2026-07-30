import { defineConfig } from 'vite'

import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
