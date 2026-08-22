import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Test-only config. Adds the React plugin (JSX transform for component tests) and
// maps the '@' path alias to ./src (mirrors tsconfig paths). Does not affect the
// Next.js build. Per-file environment is set via `// @vitest-environment jsdom`.

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

/**
 * ============================================================================
 * U03 — WHY THIS IS SPLIT INTO PROJECTS
 * ============================================================================
 * Thirteen suites under `supabase/tests` each start a REAL PostgreSQL (embedded-postgres) on a
 * fixed port. Vitest runs test FILES in parallel by default, so they were racing each other for
 * ports and for machine resources.
 *
 * Measured on one machine, one commit, four runs:
 *
 *   • orphaned postgres holding ports → 5796 passed · 0 failed · 11 skipped · **exit 0**
 *   • ports cleared                   → 5777 passed · 2 files failed · 30 skipped
 *   • ports cleared                   → 5675 passed · 3 files failed · 132 skipped
 *   • DB suites run alone             → 308 passed · 0 failed
 *
 * 🚨 The first row is the dangerous one. When a port is already taken the suite's `beforeAll`
 * throws, vitest marks its tests SKIPPED rather than failed, and the process still exits 0. A
 * release gate can therefore go green while three hundred RLS, quota and function-ACL tests never
 * ran at all.
 *
 * `fileParallelism: false` on the `db` project makes those thirteen suites run one at a time, so
 * they cannot collide. The `app` project keeps full parallelism — it is 269 files and nothing in it
 * binds a port.
 *
 * Serialising is not enough on its own: an orphaned postgres from a KILLED earlier run still holds
 * a port and would still produce a silent skip. `scripts/requiredSuites.mjs` is the second half of
 * this fix and turns "did not run" into a failure. Both are needed; neither is sufficient.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'app',
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,mjs}'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: ['supabase/tests/**/*.test.ts'],
          // One real PostgreSQL at a time. See the note above.
          fileParallelism: false,
          // Starting a server and applying migrations legitimately takes longer than a unit test.
          hookTimeout: 180_000,
          testTimeout: 120_000,
        },
      },
    ],
  },
})
