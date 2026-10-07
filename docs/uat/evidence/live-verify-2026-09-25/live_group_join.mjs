// Live verification of the group read boundary's product paths on :3007 (AUDIT only).
// J1 link holder (no auth) reads the group · J2 a new member joins through the route · J3 the new
// member now reads it via PostgREST · J4 an outsider still reads nothing · J5 the 10-member cap
// holds for a first-time joiner (counted through the service role). Writes: PRE-FLIGHT CHECK 2.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const EV = `${W}/docs/uat/evidence/live-verify-2026-09-25`
mkdirSync(EV, { recursive: true })
const req = createRequire(W + '/package.json'); const { createClient } = req('@supabase/supabase-js'); const pg = req('pg')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const URL_ = e.NEXT_PUBLIC_SUPABASE_URL, ANON = e.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ref = URL_.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') { console.error('REFUSING', ref); process.exit(2) }
console.log(`PRE-FLIGHT CHECK 2: :3007 and the direct DB connection both target ${ref} = AUDIT (non-prod).`)
const G = '3fb5af25-bd08-4cee-aacb-9cbff2e17e1c'
const admin = createClient(URL_, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const session = async (email) => { const l = await admin.auth.admin.generateLink({ type: 'magiclink', email }); const a = createClient(URL_, ANON, { auth: { persistSession: false } }); const v = await a.auth.verifyOtp({ type: 'magiclink', token_hash: l.data.properties.hashed_token }); return { token: v.data.session.access_token, id: v.data.user.id } }
const out = []
const rec = (id, what, pass, detail) => { const r = { id, what, result: pass ? 'PASS' : 'FAIL', detail }; out.push(r); console.log(JSON.stringify(r).slice(0, 500)) }
const api = async (method, path, tok, body) => { const r = await fetch('http://localhost:3007' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => null) } }
const rest = async (path, tok) => { const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${tok || ANON}` } }); const b = await r.json().catch(() => null); return Array.isArray(b) ? b.length : `status ${r.status}` }

const joiner = await session('manual.uat.admin@tappyai.com')
const outsider = await session('manual.uat.fresh@tappyai.com')

const j1 = await api('GET', `/api/group?id=${G}`)
rec('J1', 'link holder (no session) reads the group through GET /api/group', j1.status === 200 && Array.isArray(j1.body?.members), { status: j1.status, members: j1.body?.members?.length })

const j2 = await api('POST', `/api/group/${G}/join`, joiner.token, { name: 'Admin (probe)', area: 'Quận 5', budget: '150k', food_preferences: 'probe', dietary_restrictions: 'probe-sensitive-C' })
rec('J2', 'a first-time joiner joins through POST /api/group/[id]/join', j2.status === 200 && j2.body?.ok === true, { status: j2.status, body: j2.body })

rec('J3', 'the new member now reads the group + members via PostgREST (participant)', (await rest(`group_members?select=group_id&group_id=eq.${G}`, joiner.token)) >= 3, { memberRowsVisible: await rest(`group_members?select=group_id&group_id=eq.${G}`, joiner.token) })
rec('J4', 'an outsider still reads nothing via PostgREST', (await rest('group_members?select=group_id', outsider.token)) === 0 && (await rest('groups?select=id', outsider.token)) === 0, { members: await rest('group_members?select=group_id', outsider.token), groups: await rest('groups?select=id', outsider.token) })

// J5 — fill the group to 10 with existing test accounts (fixture rows), then a first-time joiner.
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const have = (await c.query('select count(*)::int n from public.group_members where group_id=$1', [G])).rows[0].n
const need = Math.max(0, 10 - have)
const filler = await c.query(`insert into public.group_members (group_id, user_id, name, area, budget, food_preferences, dietary_restrictions)
  select $1::uuid, u.id, 'Filler (cap probe)', 'Quận 1', '100k', 'probe', 'probe' from auth.users u
  where u.id not in (select user_id from public.group_members where group_id=$1 and user_id is not null) and u.email is not null and u.email <> 'manual.uat.fresh@tappyai.com'
  order by u.created_at limit $2 returning id`, [G, need])
const now = (await c.query('select count(*)::int n from public.group_members where group_id=$1', [G])).rows[0].n
await c.end()
const j5 = await api('POST', `/api/group/${G}/join`, outsider.token, { name: 'Fresh (probe)', area: 'Quận 7' })
rec('J5', 'with 10 members, a first-time joiner (who cannot see the group under RLS) is refused group_full', now >= 10 && j5.status === 400 && j5.body?.error === 'group_full', { membersBefore: have, fillerInserted: filler.rowCount, membersNow: now, status: j5.status, error: j5.body?.error })
writeFileSync(`${EV}/group-join-live.json`, JSON.stringify(out, null, 1))
