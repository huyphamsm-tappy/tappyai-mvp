// 🚨 NO SHEBANG — C02.
//
// This file began `#!/usr/bin/env node`. Node strips a shebang when it loads a module; Vite's
// esbuild transform does NOT, so `#` reached the parser and vitest reported
// `SyntaxError: Invalid or unexpected token` while collecting ZERO tests from
// `check-env.test.mjs`. `npm test` — which CI runs — failed on it.
//
// What made that expensive: the file it could not collect is the test for the deploy-time
// CONFIGURATION GATE. The one check that would have noticed a missing environment variable was the
// one that never ran, and it had been failing long enough to be treated as background noise.
//
// The shebang was never needed. Both call sites are `node scripts/check-env.mjs` (package.json
// "build" and "check:env") and the file is not executable in git (mode 100644), so nothing ever
// ran it directly.
//
// Controller V2 — Component 9b. Deploy-time configuration gate.
//
// Closes audit finding D5: "a missing or misspelled variable fails at *request*
// time, in the specific code path that reads it, rather than at deploy time."
// This runs before `next build`, so a configuration problem fails the DEPLOY and
// the previous deployment keeps serving — it never becomes a 500 on a live
// instance.
//
// Zero dependencies on purpose: it must run before anything is compiled.
//
// This file is the SINGLE SOURCE OF TRUTH for the required set.
// src/lib/config/env.ts re-declares it and envContract.test.ts fails if the two
// ever disagree.
//
// Values are NEVER printed. Only variable names and the KIND of problem.

/** Owner decision 2026-08-13 (Q2 = A): exactly these five, and no others.
 *  A variable is NOT required merely because it exists in Production, or because
 *  a consumer reads it without a fallback. Feature-specific variables belonging
 *  to inactive capabilities stay optional. */
export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'NEXT_PUBLIC_SITE_URL',
]

/** Variables that must parse as an absolute URL. D5's motivating incident was a
 *  *wrong* value, not a missing one, so presence alone is not enough. */
export const URL_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SITE_URL']

/**
 * Capabilities that are switched on by configuration and do nothing when it is absent.
 *
 * 🚨 C27. These are deliberately NOT in REQUIRED_ENV — the owner decision above fixes that set at
 * exactly five, and a capability that is legitimately off must not block a deploy. The defect was
 * that nothing SAID SO. With both Content Safety switches unset, `decidePublication` writes no
 * lifecycle columns at all and every upload is published unmoderated — while the build is green,
 * the test suite is green (it asserts the inactive path is also correct), and no line of output
 * mentions it. A deploy that loses these two variables ships a product with no content moderation
 * and looks exactly like one that does not.
 *
 * So the build now REPORTS the state. It never fails on it: reporting is what was missing.
 */
export const CAPABILITY_ENV = [
  {
    capability: 'Content Safety publication gate',
    // `flag` — these are switches whose contract is the literal string 'true'.
    mode: 'flag',
    vars: ['CONTENT_SAFETY_GATE_ENABLED', 'CONTENT_SAFETY_SCHEMA_MIGRATED'],
    whenOff: 'uploads are published without moderation and no lifecycle state is written',
  },
  {
    // U10. `.env.local` on the dev machine defines REDIS_URL, which nothing in src/ reads — the
    // cache requires the UPSTASH REST pair. So the Scam Shield directory cache and the provider
    // signal cache were both silently inactive while the configuration looked complete, and the
    // content-addressed directory key could only ever be unit-tested. Reporting it costs nothing
    // and turns "why did the cache never warm" into a line of build output.
    capability: 'Scam Shield / provider response cache (Upstash Redis)',
    // `present` — credentials, not switches. Their contract is "set to something", and testing
    // them against the string 'true' would report a correctly configured cache as inactive.
    mode: 'present',
    vars: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    whenOff: 'every check recomputes from providers — correct, but slower and more costly',
  },
]

/** Pure. Reports each capability as active/inactive, and which of its switches are missing. */
export function capabilityReport(source) {
  return CAPABILITY_ENV.map(({ capability, vars, whenOff, mode = 'flag' }) => {
    // A switch is on only when it says 'true'; a credential is on when it is set to anything.
    // Using one rule for both would misreport whichever kind it did not fit.
    const isOn = (v) =>
      mode === 'present' ? String(source[v] ?? '').trim() !== '' : source[v] === 'true'
    const off = vars.filter((v) => !isOn(v))
    return { capability, whenOff, active: off.length === 0, missing: off }
  })
}

/**
 * Pure. Returns one issue per problem; an empty array means the configuration
 * satisfies the C9b contract. Never returns or logs a value.
 */
export function validateEnv(source) {
  const issues = []
  for (const name of REQUIRED_ENV) {
    const raw = source[name]
    if (raw === undefined) {
      issues.push({ name, problem: 'missing' })
      continue
    }
    if (String(raw).trim() === '') {
      issues.push({ name, problem: 'empty' })
      continue
    }
    if (URL_ENV.includes(name)) {
      let parsed
      try {
        parsed = new URL(String(raw))
      } catch {
        issues.push({ name, problem: 'not-a-url' })
        continue
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        issues.push({ name, problem: 'not-http-url' })
      }
    }
  }
  return issues
}

/**
 * Minimal .env loader, mirroring the precedence Next.js applies: a variable
 * already present in the real environment always wins, so on Vercel the platform
 * values are used and these files are irrelevant.
 *
 * This exists because the gate runs BEFORE `next build`, and it is Next that
 * normally loads .env files. Without this, a local `npm run build` would fail
 * even with a correctly configured .env.local.
 *
 * Values are parsed but never printed.
 */
export function loadEnvFiles(readFile, existsFile, files, target) {
  for (const file of files) {
    if (!existsFile(file)) continue
    for (const line of readFile(file).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      const [, name, rawValue] = m
      if (target[name] !== undefined) continue // real environment wins
      target[name] = rawValue.trim().replace(/^["']|["']$/g, '')
    }
  }
}

// ── CLI entrypoint ───────────────────────────────────────────────────────────
// Only runs when invoked directly, so tests can import the validator safely.
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/check-env.mjs')

if (invokedDirectly) {
  const { readFileSync, existsSync } = await import('node:fs')
  loadEnvFiles(
    (f) => readFileSync(f, 'utf8'),
    (f) => existsSync(f),
    ['.env.local', '.env.production.local', '.env.production', '.env'],
    process.env
  )
  // C27 — say out loud which optional capabilities this build will ship with switched OFF.
  // Never fatal: an inactive capability is a legitimate state, an invisible one is not.
  for (const { capability, active, missing, whenOff } of capabilityReport(process.env)) {
    if (active) {
      console.log(`[C9b] capability ACTIVE — ${capability}`)
    } else {
      console.warn(
        `[C9b] capability INACTIVE — ${capability}\n` +
        `      not set: ${missing.join(', ')}\n` +
        `      consequence: ${whenOff}`
      )
    }
  }

  const issues = validateEnv(process.env)
  if (issues.length === 0) {
    console.log(`[C9b] configuration OK — ${REQUIRED_ENV.length}/${REQUIRED_ENV.length} required variables present and well-formed`)
    process.exit(0)
  }
  console.error('[C9b] DEPLOY BLOCKED — required configuration is not valid:\n')
  for (const { name, problem } of issues) {
    const explain = {
      missing: 'not set in this environment',
      empty: 'set but empty',
      'not-a-url': 'not a parseable URL',
      'not-http-url': 'URL scheme is not http/https',
    }[problem]
    console.error(`  ✗ ${name} — ${explain}`)
  }
  console.error('\nNo values are shown. Set these in the Vercel environment for this deployment target.')
  console.error('Failing the build keeps the previous deployment serving, which is the point of D5.')
  process.exit(1)
}
