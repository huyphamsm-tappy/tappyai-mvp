// F-096 E2E on AUDIT, ONE transaction, ALWAYS rolled back. Two synthetic users (never pre-existing
// accounts — RUNBOOK §A R11). U owns a public share, a group, a Google Calendar integration (fake
// token), and caused a notification in O's inbox; an admin audit row is written with email/IP/UA/
// DOB. Then U is deleted and every promise is checked in the database.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const EV = `${W}/docs/uat/evidence/f096-2026-09-26`
const pg = createRequire(W + '/package.json')('pg')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const ref = (e.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') process.exit(2)
const U = randomUUID(), O = randomUUID(), G = randomUUID(), AUD = randomUUID(), slug = 'f096' + U.slice(0, 6)
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const out = { at: new Date().toISOString(), note: 'synthetic users, rolled back', steps: {}, checks: {} }
const step = async (name, sql, params = []) => { await c.query('SAVEPOINT s'); try { await c.query(sql, params); out.steps[name] = 'ok' } catch (err) { await c.query('ROLLBACK TO SAVEPOINT s'); out.steps[name] = 'FAILED: ' + String(err.message).slice(0, 160) } }
const val = async (sql, params = []) => (await c.query(sql, params)).rows[0]
await c.query('BEGIN')
try {
  for (const [id, mail] of [[U, `f096-u-${U.slice(0, 8)}@example.test`], [O, `f096-o-${O.slice(0, 8)}@example.test`]]) {
    await step(`auth user ${mail.slice(0, 10)}`, `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{"provider":"email"}', '{}')`, [id, mail])
  }
  await step('public share owned by U', `insert into public.shared_results (slug, owner_id, query, payload, domain, locale) values ($1, $2::uuid, 'quan pho quan 1', '{"v":1}', 'food', 'vi')`, [slug, U])
  await step('group created by U', `insert into public.groups (id, creator_id, name) values ($1::uuid, $2::uuid, 'F-096 probe')`, [G, U])
  await step('google integration of U (fake token)', `insert into public.user_integrations (user_id, provider, refresh_token) values ($1::uuid, 'google_calendar', 'fake-refresh-token-f096')`, [U])
  await step('notification in O inbox caused by U', `insert into public.notifications (user_id, actor_id, type, category, title, body) values ($1::uuid, $2::uuid, 'comment', 'social', 'U binh luan review cua ban', '"ngon"')`, [O, U])
  await step('admin audit row with email/IP/UA/DOB', `insert into public.audit_log (id, actor_id, actor_email, actor_role, action, before_state, after_state, metadata, ip_address, user_agent) values ($1::uuid, $2::uuid, 'staff@example.test', 'admin', 'f096.probe', '{"date_of_birth":"1990-04-12","age_band":"35_44"}', '{"phone":"0901234567"}', '{"reason":"probe"}', '203.0.113.9', 'Mozilla/5.0 probe')`, [AUD, O])
  const a = await val(`select actor_email, ip_address, user_agent, before_state, after_state, metadata from public.audit_log where id = $1::uuid`, [AUD])
  const side = await val(`select host(ip_address) ip, user_agent from public.audit_log_client where audit_id = $1::uuid`, [AUD])
  out.checks.audit_row = { actor_email: a?.actor_email ?? null, ip_address: a?.ip_address ?? null, user_agent: a?.user_agent ?? null, before_state: a?.before_state, after_state: a?.after_state, has_client_digest: !!a?.metadata?.client_digest, side_row: side ?? null }
  out.checks.chain_problems_after_insert = (await val('select count(*)::int n from fn_verify_audit_chain()')).n

  await step('DELETE auth user U', `delete from auth.users where id = $1::uuid`, [U])
  out.checks.share_page_left = (await val(`select count(*)::int n from public.shared_results where slug = $1`, [slug])).n
  out.checks.notification_by_U_left = (await val(`select count(*)::int n from public.notifications where user_id = $1::uuid and title like 'U binh%'`, [O])).n
  out.checks.group_left = (await val(`select count(*)::int n from public.groups where id = $1::uuid`, [G])).n
  const job = await val(`select user_id::text, group_ids::text[] g, array_length(google_tokens, 1) tokens, done_at from public.account_deletion_jobs where user_id = $1::uuid`, [U])
  out.checks.deletion_job = job ? { queued: true, group_ids_match: job.g?.[0] === G, google_tokens_captured: job.tokens, done_at: job.done_at } : { queued: false }
} finally { await c.query('ROLLBACK') }
out.rolled_back = (await val(`select count(*)::int n from auth.users where id in ($1::uuid, $2::uuid)`, [U, O])).n === 0
  && (await val(`select count(*)::int n from public.account_deletion_jobs where user_id = $1::uuid`, [U])).n === 0
await c.end()
console.log(JSON.stringify(out, null, 1))
writeFileSync(`${EV}/e2e-db-rolled-back.json`, JSON.stringify(out, null, 1))
