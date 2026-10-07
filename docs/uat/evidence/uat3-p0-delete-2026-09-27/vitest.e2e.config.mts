// Runs ONLY selfDelete.e2e.ts, against AUDIT, with the app's '@' alias. Not part of `npm test`.
//   npx vitest run --config docs/uat/evidence/uat3-p0-delete-2026-09-27/vitest.e2e.config.mts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../../../../src', import.meta.url)) } },
  test: {
    include: [fileURLToPath(new URL('./selfDelete.e2e.ts', import.meta.url)).replace(/\\/g, '/')],
    environment: 'node',
    testTimeout: 60_000,
  },
})
