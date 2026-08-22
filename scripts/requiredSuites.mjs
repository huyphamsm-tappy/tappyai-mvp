#!/usr/bin/env node
/**
 * U03 — the release gate must never go green while a required suite silently did not run.
 *
 * ============================================================================
 * THE FAILURE THIS EXISTS TO STOP
 * ============================================================================
 * When an embedded-PostgreSQL suite cannot bind its port — because a sibling suite took it, or
 * because an orphaned `postgres.exe` from a killed earlier run still holds it — the suite's
 * `beforeAll` throws. Vitest then reports its tests as SKIPPED, not failed, and **the process
 * still exits 0**.
 *
 * Measured: the same commit produced `5796 passed · 0 failed · exit 0` on one run and
 * `5675 passed · 3 files failed · 132 skipped` on the next. The first run had quietly dropped
 * three hundred RLS, quota and function-ACL tests. Nothing in the output said so.
 *
 * ============================================================================
 * WHAT THIS CHECKS
 * ============================================================================
 * Vitest's JSON report lists every file it executed and every test within it. This reads that
 * report and fails when a REQUIRED suite is missing, empty, or entirely skipped.
 *
 * 🚨 "Required" is derived from the FILESYSTEM, not from a hand-written list. A new suite under a
 * required directory is required the moment it exists — the opposite of the list-based approach
 * that let this problem persist. Only deliberate, individually justified skips are tolerated, and
 * they are enumerated below.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPORT = process.argv[2] ?? 'vitest-report.json'

/** Directories whose every suite must execute. */
const REQUIRED_DIRS = ['supabase/tests', 'src/lib/security', 'src/lib/safety', 'src/lib/auth']

/**
 * Suites allowed to report zero executed tests, each with the reason.
 *
 * These are the `__measure__` probes: they call real networks and real paid models, and are gated
 * behind `MEASURE=1` on purpose. They are not in a REQUIRED_DIR, so they are listed here only to
 * document that their skipping is a decision rather than an accident.
 */
const INTENTIONAL_SKIPS = {
  'src/lib/ai/__measure__/cacheProbe.test.ts': 'MEASURE-gated: real network + paid model',
  'src/lib/ai/__measure__/domainMatrix.test.ts': 'MEASURE-gated: real network + paid model',
  'src/lib/ai/__measure__/memoryGate.test.ts': 'MEASURE-gated: real network + paid model',
  'src/lib/ai/__measure__/refinementProbe.test.ts': 'MEASURE-gated: real network + paid model',
  'src/lib/ai/__measure__/reviewSourceProbe.test.ts': 'MEASURE-gated: real network + paid model',
  'src/lib/ai/__measure__/toolPayload.test.ts': 'MEASURE-gated: real network + paid model',
}

const norm = (p) => String(p).replace(/\\/g, '/').replace(/^.*?(?=(src|supabase|scripts)\/)/, '')

function testFilesUnder(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) testFilesUnder(p, out)
    else if (/\.test\.(ts|tsx|mjs)$/.test(entry)) out.push(norm(p))
  }
  return out
}

if (!existsSync(REPORT)) {
  console.error(`\n✖ required-suite gate: no vitest report at ${REPORT}.`)
  console.error('  The test run did not produce one, which means its result cannot be trusted.\n')
  process.exit(1)
}

let report
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'))
} catch (e) {
  console.error(`\n✖ required-suite gate: ${REPORT} is not readable JSON — ${e.message}\n`)
  process.exit(1)
}

/** file → { total, ran } from the report. */
const executed = new Map()
for (const suite of report.testResults ?? []) {
  const file = norm(suite.name ?? suite.testFilePath ?? '')
  const assertions = suite.assertionResults ?? []
  const ran = assertions.filter((a) => a.status !== 'pending' && a.status !== 'skipped' && a.status !== 'todo').length
  const prev = executed.get(file) ?? { total: 0, ran: 0 }
  executed.set(file, { total: prev.total + assertions.length, ran: prev.ran + ran })
}

const required = REQUIRED_DIRS.flatMap((d) => testFilesUnder(d))
const missing = []
const empty = []

for (const file of required) {
  if (file in INTENTIONAL_SKIPS) continue
  const seen = executed.get(file)
  if (!seen) { missing.push(file); continue }
  if (seen.ran === 0) empty.push(`${file} (${seen.total} declared, 0 executed)`)
}

// Suites that vanished from the report but are neither required nor intentionally skipped are
// worth surfacing too — quietly, because they are not a gate failure.
const unexplained = Object.keys(INTENTIONAL_SKIPS).filter((f) => {
  const seen = executed.get(f)
  return seen && seen.ran > 0
})

console.log('\n── required-suite gate ──')
console.log(`report              : ${REPORT}`)
console.log(`suites in report    : ${executed.size}`)
console.log(`required suites     : ${required.length}  (${REQUIRED_DIRS.join(', ')})`)
console.log(`intentional skips   : ${Object.keys(INTENTIONAL_SKIPS).length}  (MEASURE-gated)`)
if (unexplained.length) {
  console.log(`note                : ${unexplained.length} MEASURE-gated suite(s) ran — MEASURE is set`)
}

if (missing.length === 0 && empty.length === 0) {
  console.log('result              : OK — every required suite executed\n')
  process.exit(0)
}

console.error('\n✖ REQUIRED SUITES DID NOT RUN — this result cannot be used as a release gate.\n')
if (missing.length) {
  console.error(`  Absent from the report (${missing.length}):`)
  for (const f of missing) console.error(`    · ${f}`)
}
if (empty.length) {
  console.error(`  Present but executed nothing (${empty.length}):`)
  for (const f of empty) console.error(`    · ${f}`)
}
console.error('\n  A suite that could not start is a FAILURE, not a skip. Common cause on this')
console.error('  project: an orphaned postgres process still holding an embedded-postgres port.')
console.error('  Check with:  node scripts/requiredSuites.mjs --help-ports\n')
process.exit(1)
