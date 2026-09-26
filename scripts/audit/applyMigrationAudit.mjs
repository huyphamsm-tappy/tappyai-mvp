// Apply ONE migration file to the AUDIT Supabase project (never production).
// usage: node scripts/audit/applyMigrationAudit.mjs <path/to/migration.sql> [--verify-table <name>]
//
// Reads the audit worktree's .env.local for the project ref + DB password only; prints neither.
// Refuses unless the ref equals AUDIT_CONFIRMED_NONPROD_REF and differs from the production ref.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const PROD_REF = 'fwznnobrdctuskgrvuik'
const ENV = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/.env.local'
const [file] = process.argv.slice(2)
const opt = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1] }
if (!file) throw new Error('migration path required')

const env = Object.fromEntries(
  readFileSync(ENV, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const url = env.NEXT_PUBLIC_SUPABASE_URL || ''
const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!ref || ref === PROD_REF || ref !== env.AUDIT_CONFIRMED_NONPROD_REF) {
  throw new Error(`refusing: project ref is not the confirmed non-prod audit project`)
}
const password = env.SUPABASE_DB_PASSWORD
if (!password) throw new Error('no DB password in the audit env')

const require = createRequire('D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/package.json')
const { Client } = require('pg')
const sql = readFileSync(file, 'utf8')

// Supabase direct connection (session pooler host works for DDL too).
const hosts = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' },
  { host: `aws-0-ap-southeast-1.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
]
let client = null, lastErr = null
for (const h of hosts) {
  const c = new Client({ ...h, database: 'postgres', password, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 })
  try { await c.connect(); client = c; console.log('connected via', h.host); break } catch (e) { lastErr = e; console.log('connect failed via', h.host, '-', String(e.message).slice(0, 80)) }
}
if (!client) throw lastErr
try {
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log('applied', file)
  const table = opt('--verify-table')
  if (table) {
    const r = await client.query(`select to_regclass($1) as t, (select count(*) from pg_policies where schemaname='public' and tablename=$2) as policies, (select relrowsecurity from pg_class where oid = to_regclass($1)) as rls`, [`public.${table}`, table])
    console.log('verify', JSON.stringify(r.rows[0]))
  }
} catch (e) {
  await client.query('rollback').catch(() => {})
  throw e
} finally {
  await client.end()
}
