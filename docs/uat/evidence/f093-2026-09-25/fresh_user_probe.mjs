// E2E on AUDIT, ONE transaction, ALWAYS rolled back: create a user (auth.users insert — the real
// on_auth_user_created trigger runs), give them memory + evidence + usage + a conversation, delete
// the account, and count every row anywhere that still carries their id or email.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const pg = createRequire(W + '/package.json')('pg')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const ref = e.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') process.exit(2)
const label = process.argv[2] || 'fresh'
const uid = randomUUID(), mail = `f093-probe-${uid.slice(0, 8)}@example.test`
console.log(`PRE-FLIGHT CHECK 2: ${ref} = AUDIT. Transaction creates + deletes ${mail}; ALWAYS rolled back.`)
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const cols = (await c.query(`select c.table_schema s, c.table_name t, c.column_name col, c.data_type dt
  from information_schema.columns c join information_schema.tables tb on tb.table_schema=c.table_schema and tb.table_name=c.table_name and tb.table_type='BASE TABLE'
  where c.table_schema not in ('pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','supabase_functions','supabase_migrations','vault','net','pgsodium','pgsodium_masks','cron','pgbouncer','_realtime','_analytics','pg_toast')
    and c.data_type in ('uuid','text','character varying') order by 1,2,3`)).rows
const scan = async () => {
  const out = {}
  for (const x of cols) {
    await c.query('SAVEPOINT scan')
    const q = x.dt === 'uuid' ? `select count(*)::int n from "${x.s}"."${x.t}" where "${x.col}" = $1::uuid` : `select count(*)::int n from "${x.s}"."${x.t}" where "${x.col}" = $1 or lower("${x.col}") = $2`
    try { const n = (await c.query(q, x.dt === 'uuid' ? [uid] : [uid, mail])).rows[0].n; if (n > 0) out[`${x.s}.${x.t}.${x.col}`] = n } catch (err) { await c.query('ROLLBACK TO SAVEPOINT scan') }
  }
  return out
}
const steps = {}
const step = async (name, sql, params = []) => { await c.query('SAVEPOINT st'); try { await c.query(sql, params); steps[name] = 'ok' } catch (err) { await c.query('ROLLBACK TO SAVEPOINT st'); steps[name] = 'FAILED: ' + String(err.message).slice(0, 160) } }
const r = { label, at: new Date().toISOString(), email: mail }
await c.query('BEGIN')
try {
  await c.query("SET LOCAL statement_timeout = '120s'")
  await step('auth.users insert (trigger on_auth_user_created runs)', `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{"provider":"email"}', '{}')`, [uid, mail])
  await step('user_memory row', `insert into public.user_memory (user_id, location_base, preferences, history) values ($1::uuid, 'Quận 3', '{"food":["phở"]}', '["probe"]')`, [uid])
  await step('decision_evidence via decision_evidence_save (auth.uid() = the new user)', `select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', json_build_object('sub', $1, 'role', 'authenticated')::text, true)`, [uid])
  await step('decision_evidence_save()', `select public.decision_evidence_save(gen_random_uuid(), '{"v":1,"probe":true}'::jsonb)`)
  await step('anon_chat_usage row', `insert into public.anon_chat_usage (user_id, day, count) values ($1::uuid, current_date, 2)`, [uid])
  await step('conversations row', `insert into public.conversations (user_id, title, messages) values ($1::uuid, 'probe', '[]'::jsonb)`, [uid])
  await step('user_preferences row', `insert into public.user_preferences (user_id) values ($1::uuid)`, [uid])
  r.steps = steps
  r.before = await scan()
  await step('DELETE the account (auth.users)', `delete from auth.users where id = $1::uuid`, [uid])
  r.steps = steps
  r.after = await scan()
} finally { await c.query('ROLLBACK') }
r.rolledBack = (await c.query('select count(*)::int n from auth.users where id = $1::uuid', [uid])).rows[0].n === 0
await c.end()
console.log(JSON.stringify(r, null, 1))
writeFileSync(`${W}/docs/uat/evidence/f093-2026-09-25/fresh-user-e2e-${label}.json`, JSON.stringify(r, null, 1))
