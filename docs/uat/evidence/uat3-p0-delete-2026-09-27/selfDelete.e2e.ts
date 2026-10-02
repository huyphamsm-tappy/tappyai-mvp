// UAT3 P0 — self-service deletion, END TO END on AUDIT, through the real route handler.
//
// Two THROWAWAY users created here (never pre-existing accounts — RUNBOOK §A R11): U deletes
// themself, O is the other person whose inbox holds a notification U caused. U signs in with a
// password to get a real JWT; the route is called with `Authorization: Bearer` exactly as a native
// client would (the web sends the cookie; `getRequestUser` resolves both the same way).
// Checks the rows F-096 established, then removes O and U's queued job (the local machine has no
// bucket credential to run the worker; the worker itself was proven in fd10590).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const EV = `${W}/docs/uat/evidence/uat3-p0-delete-2026-09-27`
const env = Object.fromEntries(readFileSync(`${W}/.env.local`, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') throw new Error('not AUDIT — refusing')
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) process.env[k] = env[k]
process.env.ACCOUNT_SELF_DELETE_ENABLED = 'true'

const pg = createRequire(`${W}/package.json`)('pg')
const db = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const n = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0].n as number

const tag = randomUUID().slice(0, 8)
const pw = randomBytes(18).toString('base64url')
const G = randomUUID(), slug = 'uat3p0' + tag
let U = '', O = '', token = ''
const out: Record<string, unknown> = { at: new Date().toISOString(), note: 'throwaway users on AUDIT; route called with a real JWT' }

beforeAll(async () => {
  await db.connect()
  const u = await admin.auth.admin.createUser({ email: `uat3-p0-u-${tag}@example.test`, password: pw, email_confirm: true })
  const o = await admin.auth.admin.createUser({ email: `uat3-p0-o-${tag}@example.test`, password: randomBytes(18).toString('base64url'), email_confirm: true })
  if (u.error || o.error) throw new Error('createUser failed')
  U = u.data.user!.id; O = o.data.user!.id
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const s = await anon.auth.signInWithPassword({ email: `uat3-p0-u-${tag}@example.test`, password: pw })
  if (s.error) throw new Error('sign-in failed')
  token = s.data.session!.access_token

  await db.query(`insert into public.shared_results (slug, owner_id, query, payload, domain, locale) values ($1, $2::uuid, 'quan pho quan 1', '{"v":1}', 'food', 'vi')`, [slug, U])
  await db.query(`insert into public.groups (id, creator_id, name) values ($1::uuid, $2::uuid, 'UAT3 P0 probe')`, [G, U])
  await db.query(`insert into public.user_integrations (user_id, provider, refresh_token) values ($1::uuid, 'google_calendar', 'fake-refresh-token-uat3')`, [U])
  await db.query(`insert into public.notifications (user_id, actor_id, type, category, title, body) values ($1::uuid, $2::uuid, 'comment', 'social', 'U binh luan review cua ban', '"ngon"')`, [O, U])
  await db.query(`insert into public.user_memory (user_id, location_base) values ($1::uuid, 'uat3 probe')`, [U])
  out.seeded = {
    profile: await n(`select count(*)::int n from public.profiles where id = $1::uuid`, [U]),
    share: await n(`select count(*)::int n from public.shared_results where owner_id = $1::uuid`, [U]),
    group: await n(`select count(*)::int n from public.groups where id = $1::uuid`, [G]),
    integration: await n(`select count(*)::int n from public.user_integrations where user_id = $1::uuid`, [U]),
    notification_in_O: await n(`select count(*)::int n from public.notifications where user_id = $1::uuid and actor_id = $2::uuid`, [O, U]),
    user_memory: await n(`select count(*)::int n from public.user_memory where user_id = $1::uuid`, [U]),
  }
})

afterAll(async () => {
  if (U) await db.query(`delete from public.account_deletion_jobs where user_id = $1::uuid`, [U]).catch(() => {})
  if (O) await admin.auth.admin.deleteUser(O).catch(() => {})
  out.cleanup = {
    O_left: O ? await n(`select count(*)::int n from auth.users where id = $1::uuid`, [O]) : null,
    U_left: U ? await n(`select count(*)::int n from auth.users where id = $1::uuid`, [U]) : null,
    job_left: U ? await n(`select count(*)::int n from public.account_deletion_jobs where user_id = $1::uuid`, [U]) : null,
  }
  await db.end()
  writeFileSync(`${EV}/e2e-result.json`, JSON.stringify(out, null, 1))
})

const call = async (confirm: unknown, bearer = token) => {
  const { POST } = await import('@/app/api/account/delete/route')
  return POST(new Request('http://localhost/api/account/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify({ confirm }),
  }))
}

describe('self-service deletion on AUDIT', () => {
  it('the wrong word deletes nothing', async () => {
    const r = await call('xoa di')
    out.wrong_word = r.status
    expect(r.status).toBe(400)
    expect(await n(`select count(*)::int n from auth.users where id = $1::uuid`, [U])).toBe(1)
  })

  it('the typed word deletes the account and everything F-096 established', async () => {
    const r = await call('X' + String.fromCharCode(0xd3) + 'A')
    out.delete_status = r.status
    expect(r.status).toBe(200)
    const job = (await db.query(`select array_length(group_ids, 1) groups, (group_ids)[1]::text g, array_length(google_tokens, 1) tokens, done_at from public.account_deletion_jobs where user_id = $1::uuid`, [U])).rows[0]
    const after = {
      auth_user: await n(`select count(*)::int n from auth.users where id = $1::uuid`, [U]),
      profile: await n(`select count(*)::int n from public.profiles where id = $1::uuid`, [U]),
      share: await n(`select count(*)::int n from public.shared_results where slug = $1`, [slug]),
      group: await n(`select count(*)::int n from public.groups where id = $1::uuid`, [G]),
      integration: await n(`select count(*)::int n from public.user_integrations where user_id = $1::uuid`, [U]),
      notification_in_O: await n(`select count(*)::int n from public.notifications where user_id = $1::uuid and title = 'U binh luan review cua ban'`, [O]),
      user_memory: await n(`select count(*)::int n from public.user_memory where user_id = $1::uuid`, [U]),
      deletion_job: job ? { queued: true, group_ids_match: job.g === G, google_tokens_captured: job.tokens, done_at: job.done_at } : { queued: false },
    }
    out.after = after
    expect(after).toMatchObject({ auth_user: 0, profile: 0, share: 0, group: 0, integration: 0, notification_in_O: 0, user_memory: 0 })
    expect(after.deletion_job).toEqual({ queued: true, group_ids_match: true, google_tokens_captured: 1, done_at: null })
  })

  it('the old token can no longer act', async () => {
    const r = await call('DELETE')
    out.after_delete_same_token = r.status
    expect(r.status).toBe(401)
  })
})
