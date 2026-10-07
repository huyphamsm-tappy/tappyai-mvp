#!/usr/bin/env node
// Pre-UAT identity check (consolidation 2026-09-24): prints WHICH worktree, branch,
// commit, Supabase project and dev port you are about to run. Never prints secrets.
//   Run:  npm run whoami        (or: node scripts/whoami.mjs)
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const sh = (c) => { try { return execSync(c, { encoding: 'utf8' }).trim() } catch { return 'unknown' } }
const env = (() => { try { return readFileSync('.env.local', 'utf8') } catch { return '' } })()
const val = (k) => (env.split(/\r?\n/).find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1)

const ref = (val('NEXT_PUBLIC_SUPABASE_URL').match(/([a-z0-9]{20})\.supabase\.co/) || [])[1] || 'none'
const PROD = 'fwznnobrdctuskgrvuik'
const port = (() => {
  try { return (readFileSync('package.json', 'utf8').match(/"dev"\s*:\s*"[^"]*-p\s+(\d+)/) || [])[1] || '3000 (default)' }
  catch { return '3000 (default)' }
})()

const isProd = ref === PROD
console.log([
  '',
  '  worktree : ' + process.cwd(),
  '  branch   : ' + sh('git rev-parse --abbrev-ref HEAD'),
  '  commit   : ' + sh('git rev-parse --short HEAD') + (sh('git status --porcelain').length ? ' (+ local changes)' : ''),
  '  supabase : ' + ref + (isProd ? '  🛑 PRODUCTION' : '  ✅ audit/non-prod'),
  '  dev port : ' + port,
  '',
].join('\n'))
if (isProd) { console.error('  ⚠️  This checkout points at PRODUCTION. `npm run dev` will refuse to start (next.config guard).\n'); process.exitCode = 1 }
