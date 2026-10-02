// ── Production-database guard for every `next` command (dev, build, start) ──────────────────
//
// WHY THIS EXISTS. A local checkout that can reach the PRODUCTION Supabase project is the single
// most damaging mistake available here. The first guard (2026-09-24, STEP-3) only covered
// `next dev` and only looked at process.env — but Next.js auto-loads `.env.production.local` and
// `.env.production` on `next build` / `next start`, and a `vercel env pull` wrote exactly such a
// file (with the production Supabase URL and anon key) into the main checkout. `next start` there
// would have served against production with no warning.
//
// WHAT IT CHECKS, on every command that loads next.config:
//   1. every process.env value (after Next has merged the env files), and
//   2. every env file Next would load from the project directory — read directly, so a production
//      file is refused even if a later file happens to override the variable,
// for the production project ref. Any hit → refuse with a message naming the file / variable.
//
// THE ONE LEGITIMATE CASE: a real Vercel build/runtime, where production values are supposed to
// be present. `VERCEL=1` alone does not prove that — the pulled `.env.production.local` contains
// `VERCEL="1"` itself — so the process must ALSO be running under Vercel's own build root
// (`/vercel/…`), which a local Windows/macOS checkout never is.
//
// THE OVERRIDE: `ALLOW_PROD_SUPABASE_IN_DEV=1` still exists, but it is LOUD on every start.
// A silent override is how this comes back.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROD_SUPABASE_REF = 'fwznnobrdctuskgrvuik'
export const AUDIT_SUPABASE_REF = 'zdaprdfgpbpnxyofagmc'

/** The env files `next dev` / `next build` / `next start` load (any NODE_ENV). */
export const NEXT_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
]

export function isRealVercel(env = process.env, cwd = process.cwd()) {
  return env.VERCEL === '1' && /^\/vercel\//.test(String(cwd).replace(/\\/g, '/'))
}

/**
 * Where the production ref appears: `{ files: [...], vars: [...] }` — names only, never values.
 * @param {{ env?: Record<string, string|undefined>, cwd?: string, files?: string[] }} [opts]
 */
export function findProductionReferences(opts = {}) {
  const env = opts.env ?? process.env
  const cwd = opts.cwd ?? process.cwd()
  const files = []
  for (const f of opts.files ?? NEXT_ENV_FILES) {
    const p = join(cwd, f)
    try {
      if (existsSync(p) && readFileSync(p, 'utf8').includes(PROD_SUPABASE_REF)) files.push(f)
    } catch { /* unreadable → not ours to judge */ }
  }
  const vars = Object.entries(env)
    .filter(([, v]) => typeof v === 'string' && v.includes(PROD_SUPABASE_REF))
    .map(([k]) => k)
    .sort()
  return { files, vars }
}

/**
 * Throws when this command would run against production; prints a loud banner when the override
 * is used. `command` is only for the message ('dev' | 'build' | 'start' | 'unknown').
 */
export function assertNotProduction({ env = process.env, cwd = process.cwd(), command = 'unknown', log = console.error } = {}) {
  if (isRealVercel(env, cwd)) return { allowed: 'vercel' }
  const hits = findProductionReferences({ env, cwd })
  const found = hits.files.length > 0 || hits.vars.length > 0
  const override = env.ALLOW_PROD_SUPABASE_IN_DEV === '1'

  if (override) {
    const bar = '!'.repeat(78)
    log(
      `\n${bar}\n` +
      `!!  ⚠️  ALLOW_PROD_SUPABASE_IN_DEV=1 — the production-database guard is OVERRIDDEN\n` +
      `!!  command: next ${command}   dir: ${cwd}\n` +
      (found
        ? `!!  🔴 PRODUCTION project ${PROD_SUPABASE_REF} IS REFERENCED:\n` +
          (hits.files.length ? `!!     files: ${hits.files.join(', ')}\n` : '') +
          (hits.vars.length ? `!!     vars:  ${hits.vars.join(', ')}\n` : '') +
          `!!  Every read AND WRITE from this process can hit production data.\n`
        : `!!  (no production reference found right now — remove the override)\n`) +
      `!!  Unset ALLOW_PROD_SUPABASE_IN_DEV to restore the guard.\n${bar}\n`,
    )
    return { allowed: 'override', ...hits }
  }

  if (found) {
    throw new Error(
      `\n\n🛑 REFUSING TO START \`next ${command}\` — this checkout points at the PRODUCTION Supabase project (${PROD_SUPABASE_REF}).\n` +
      (hits.files.length ? `   Env files with the production ref: ${hits.files.join(', ')}\n` : '') +
      (hits.vars.length ? `   Variables with the production ref: ${hits.vars.join(', ')}\n` : '') +
      `   Dir: ${cwd}\n\n` +
      `   Fix: remove/delete those files (production values live in Vercel), and point .env.local at the\n` +
      `   AUDIT project (${AUDIT_SUPABASE_REF}).\n` +
      `   Override (NOT recommended, and loud): ALLOW_PROD_SUPABASE_IN_DEV=1\n`,
    )
  }
  return { allowed: 'clean', ...hits }
}
