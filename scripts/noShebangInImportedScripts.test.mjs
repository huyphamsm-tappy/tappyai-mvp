import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * C02 — a script that a TEST imports must not start with a shebang.
 *
 * ============================================================================
 * WHAT HAPPENED
 * ============================================================================
 * `scripts/check-env.mjs` began `#!/usr/bin/env node`. Node strips a shebang when it loads a
 * module, so `node scripts/check-env.mjs` worked and `node --check` passed. Vite's esbuild
 * transform does NOT strip it, so `#` reached the parser and vitest failed the whole file with
 * `SyntaxError: Invalid or unexpected token`, collecting **zero** tests.
 *
 * The file it could not collect is the test for the deploy-time CONFIGURATION GATE — so the one
 * check that would notice a missing environment variable was the one that never ran, and
 * `npm test` (what CI runs) had a permanent red that everyone had learned to scroll past. C27 —
 * Content Safety silently inactive — was living directly behind it.
 *
 * 🚨 The failure mode is what makes this worth a guard: it does not look like a broken test, it
 * looks like a broken FILE, and a suite that reports "no tests" reports success everywhere else.
 */

const ROOT = join(import.meta.dirname, '..')
const SCRIPTS = join(ROOT, 'scripts')

function mjsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) mjsFiles(p, out)
    else if (entry.endsWith('.mjs')) out.push(p)
  }
  return out
}

/** Every script that a `.test.mjs` in this repo imports, so vitest has to parse it. */
function importedByTests() {
  const all = mjsFiles(SCRIPTS)
  const tests = all.filter((f) => f.endsWith('.test.mjs'))
  const imported = new Set()
  for (const test of tests) {
    const dir = join(test, '..')
    for (const m of readFileSync(test, 'utf8').matchAll(/from\s+'(\.[^']+\.mjs)'/g)) {
      imported.add(join(dir, m[1]))
    }
  }
  return [...imported]
}

describe('C02 — imported scripts stay parseable by the test runner', () => {
  const targets = importedByTests()

  it('finds the scripts under test', () => {
    // Without this the suite below would pass by iterating over nothing — the same shape of
    // silence that hid the original bug.
    expect(targets.length).toBeGreaterThan(0)
  })

  it.each(targets.map((t) => relative(ROOT, t).replace(/\\/g, '/')))(
    '%s has no shebang',
    (rel) => {
      const first = readFileSync(join(ROOT, rel), 'utf8').slice(0, 2)
      expect(
        first,
        'Node strips a shebang on import; esbuild does not, so vitest fails the file with ' +
        'SyntaxError and silently collects zero tests from it. Invoke via `node <file>` instead.',
      ).not.toBe('#!')
    },
  )
})

describe('C02 — the configuration gate test is actually running', () => {
  it('check-env.test.mjs contributes real assertions', () => {
    // The point of the fix is not that a file parses — it is that this specific suite executes.
    const src = readFileSync(join(SCRIPTS, 'check-env.test.mjs'), 'utf8')
    expect(src.match(/\bit\(/g)?.length ?? 0).toBeGreaterThan(5)
    expect(src).toContain('validateEnv')
  })
})
