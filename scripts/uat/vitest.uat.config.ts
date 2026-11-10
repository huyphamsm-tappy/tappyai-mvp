// Config for the Explore video UAT only (the normal config does not include *.uat.ts). Run:
//   npx vitest run --config scripts/uat/vitest.uat.config.ts scripts/uat/exploreVideo.uat.ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
export default defineConfig({
  root,
  resolve: {
    alias: {
      '@': `${root}src`,
      'server-only': `${root}node_modules/next/dist/compiled/server-only/empty.js`,
    },
  },
  test: {
    include: ['scripts/uat/**/*.uat.ts'],
    environment: 'node',
    testTimeout: 900_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
