// Account-deletion probe on the AUDIT database, run INSIDE ONE TRANSACTION THAT IS ROLLED BACK.
// Nothing is deleted or created persistently: the user is deleted from auth.users, every column in
// every application table that holds that user's id is counted before and after, then ROLLBACK.
// It exercises the real schema — every FK, cascade and trigger — on real data.
// Usage: node deletion_probe.mjs <email> <label>
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const EV = `${W}/docs/uat/evidence/f093-2026-09-25`
mkdirSync(EV, { recursive: true })
const pg = createRequire(W + '/package.json')('pg')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const ref = (e.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') { console.error('REFUSING', ref); process.exit(2) }
const [email, label] = process.argv.slice(2) // evidence files redact the email; the label names the account class
console.log(`PRE-FLIGHT CHECK 2: target ${ref} = AUDIT (non-prod). Transaction with DELETE FROM auth.users for ${email}, ALWAYS rolled back.`)
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const uid = (await c.query('select id::text id from auth.users where email=$1', [email])).rows[0]?.id
const mail = email.toLowerCase()
if (!uid) { console.error('no such user'); process.exit(2) }
// Every uuid/text/varchar column in application schemas (not auth/system/extension internals).
const cols = (await c.query(`select c.table_schema s, c.table_name t, c.column_name col, c.data_type dt
  from information_schema.columns c join information_schema.tables tb on tb.table_schema=c.table_schema and tb.table_name=c.table_name and tb.table_type='BASE TABLE'
  where c.table_schema not in ('pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','supabase_functions','supabase_migrations','vault','net','pgsodium','pgsodium_masks','cron','pgbouncer','_realtime','_analytics','pg_toast')
    and c.data_type in ('uuid','text','character varying')
  order by 1,2,3`)).rows
const count = async () => {
  const out = {}
  for (const x of cols) {
    await c.query('SAVEPOINT scan')
    const q = x.dt === 'uuid' ? `select count(*)::int n from "${x.s}"."${x.t}" where "${x.col}" = $1::uuid` : `select count(*)::int n from "${x.s}"."${x.t}" where "${x.col}" = $1 or lower("${x.col}") = $2`
    try { const n = (await c.query(q, x.dt === 'uuid' ? [uid] : [uid, mail])).rows[0].n; if (n > 0) out[`${x.s}.${x.t}.${x.col}`] = n } catch (err) { out[`!${x.s}.${x.t}.${x.col}`] = String(err.message).slice(0, 80); await c.query('ROLLBACK TO SAVEPOINT scan').catch(() => {}) }
  }
  return out
}
const result = { label, email, at: new Date().toISOString(), columnsScanned: cols.length }
await c.query('BEGIN')
try {
  await c.query("SET LOCAL statement_timeout = '60s'")
  result.before = await count()
  try {
    await c.query('SAVEPOINT del')
    await c.query('delete from auth.users where id = $1::uuid', [uid])
    result.deleteError = null
  } catch (err) {
    await c.query('ROLLBACK TO SAVEPOINT del')
    result.deleteError = String(err.message).slice(0, 300)
  }
  result.after = await count()
  result.survivors = Object.fromEntries(Object.entries(result.after))
} finally {
  await c.query('ROLLBACK')
}
result.rolledBack = (await c.query('select count(*)::int n from auth.users where id=$1::uuid', [uid])).rows[0].n === 1
await c.end()
console.log(JSON.stringify({ label, deleteError: result.deleteError, before: result.before, survivors: result.survivors, rolledBack: result.rolledBack }, null, 1))
writeFileSync(`${EV}/deletion-probe-${label}.json`, JSON.stringify(result, null, 1))
