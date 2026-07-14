import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Test-only config. Adds the React plugin (JSX transform for component tests) and
// maps the '@' path alias to ./src (mirrors tsconfig paths). Does not affect the
// Next.js build. Per-file environment is set via `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
