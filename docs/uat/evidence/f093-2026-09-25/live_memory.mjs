// After 20260911b (user_memory.user_id text -> uuid): the product memory API still reads and writes on :3007 (AUDIT).
// Writes back the account's OWN current location_base (no content change) and proves the upsert landed via updated_at.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const req = createRequire(W + '/package.json'); const { createClient } = req('@supabase/supabase-js'); const pg = req('pg')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const ref = e.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') process.exit(2)
console.log('PRE-FLIGHT CHECK 2: :3007 + DB =', ref, '= AUDIT. One PATCH writing the same location_base back.')
const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const l = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'manual.uat.pro@tappyai.com' })
const anon = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const s = (await anon.auth.verifyOtp({ type: 'magiclink', token_hash: l.data.properties.hashed_token })).data.session
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const row = async () => (await c.query('select user_id::text, location_base, updated_at::text from public.user_memory where user_id = $1::uuid', [s.user.id])).rows[0]
const api = async (m, body) => { const r = await fetch('http://localhost:3007/api/memory', { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}` }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => null) } }
const before = await row()
const get = await api('GET')
const patch = await api('PATCH', { location_base: before.location_base ?? 'Quận 1' })
const after = await row()
// RLS read of the uuid column through PostgREST as the user (the policy was recreated as auth.uid() = user_id)
const rest = await fetch(`${e.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_memory?select=user_id`, { headers: { apikey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}` } }).then(r => r.json())
const out = {
  M1_get: { status: get.status, memoryReturned: get.body?.memory != null, pass: get.status === 200 && get.body?.memory != null },
  M2_patch: { status: patch.status, ok: patch.body?.ok, updatedAtBefore: before.updated_at, updatedAtAfter: after.updated_at, locationUnchanged: before.location_base === after.location_base, pass: patch.body?.ok === true && after.updated_at !== before.updated_at },
  M3_rls_own_rows_only: { rowsVisible: Array.isArray(rest) ? rest.length : rest, allOwn: Array.isArray(rest) && rest.every(r => r.user_id === s.user.id), pass: Array.isArray(rest) && rest.length === 1 && rest[0].user_id === s.user.id },
}
console.log(JSON.stringify(out, null, 1))
writeFileSync(`${W}/docs/uat/evidence/f093-2026-09-25/memory-api-after-uuid.json`, JSON.stringify(out, null, 1))
await c.end()
