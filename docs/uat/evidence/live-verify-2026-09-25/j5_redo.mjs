// Revert my own filler rows (they used real accounts by mistake) and redo J5 with account-less rows.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const req = createRequire(W + '/package.json'); const pg = req('pg'); const { createClient } = req('@supabase/supabase-js')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const URL_ = e.NEXT_PUBLIC_SUPABASE_URL, ANON = e.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ref = URL_.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') process.exit(2)
console.log(`PRE-FLIGHT CHECK 2: target ${ref} = AUDIT (non-prod). Reverting 5 filler rows + the fresh join row in group 3fb5af25 only, then inserting account-less filler rows.`)
const G = '3fb5af25-bd08-4cee-aacb-9cbff2e17e1c'
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const del = await c.query(`delete from public.group_members where group_id=$1 and name in ('Filler (cap probe)','Fresh (probe)') returning name`, [G])
console.log('reverted rows:', del.rowCount)
const have = (await c.query('select count(*)::int n from public.group_members where group_id=$1', [G])).rows[0].n
const ins = await c.query(`insert into public.group_members (group_id, user_id, name, area, budget, food_preferences, dietary_restrictions)
  select $1::uuid, null, 'Cap probe #' || g, 'Quận 1', '100k', 'probe', 'probe' from generate_series(1, $2) g returning id`, [G, Math.max(0, 10 - have)])
const now = (await c.query('select count(*)::int n from public.group_members where group_id=$1', [G])).rows[0].n
await c.end()
const admin = createClient(URL_, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const l = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'manual.uat.fresh@tappyai.com' })
const a = createClient(URL_, ANON, { auth: { persistSession: false } })
const tok = (await a.auth.verifyOtp({ type: 'magiclink', token_hash: l.data.properties.hashed_token })).data.session.access_token
const r = await fetch(`http://localhost:3007/api/group/${G}/join`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify({ name: 'Fresh (probe)', area: 'Quận 7' }) })
const body = await r.json().catch(() => null)
const res = { id: 'J5', what: 'with 10 members, a first-time joiner (who cannot see the group under RLS) is refused group_full — counted through the service role', result: now >= 10 && r.status === 400 && body?.error === 'group_full' ? 'PASS' : 'FAIL', detail: { membersBefore: have, accountlessFillerInserted: ins.rowCount, membersNow: now, status: r.status, error: body?.error, note: 'first attempt used real audit accounts as filler by mistake; those 5 rows (and the fresh join) were reverted before this run' } }
console.log(JSON.stringify(res))
const f = `${W}/docs/uat/evidence/live-verify-2026-09-25/group-join-live.json`
const all = JSON.parse(readFileSync(f, 'utf8')).filter(x => x.id !== 'J5'); all.push(res); writeFileSync(f, JSON.stringify(all, null, 1))
