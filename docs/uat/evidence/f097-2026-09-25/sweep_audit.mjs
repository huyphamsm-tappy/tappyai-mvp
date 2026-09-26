// F-097 on AUDIT: apply 20260925b, then the one-off cleanup the owner ordered on 2026-09-25
// ("add the cleanup job for expired decision_evidence, and run the one-off cleanup on audit").
// Scope: rows with expires_at < now() ONLY (RUNBOOK §A R11 exception: explicitly ordered).
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const EV = `${W}/docs/uat/evidence/f097-2026-09-25`; mkdirSync(EV, { recursive: true })
const pg = createRequire(W + '/package.json')('pg')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const ref = (e.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') { console.error('REFUSING', ref); process.exit(2) }
const log = []; const say = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); log.push(s); console.log(s) }
say(`PRE-FLIGHT CHECK 2: target ${ref} = AUDIT (non-prod). Apply 20260925b_decision_evidence_sweep.sql, then decision_evidence_sweep() once.`)
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
c.on('notice', n => say(`  ${n.severity}: ${n.message}`))
await c.connect()
const state = async () => (await c.query(`select count(*)::int total,
  count(*) filter (where expires_at < now())::int expired,
  count(*) filter (where expires_at >= now())::int live,
  count(*) filter (where not exists (select 1 from auth.users u where u.id = d.owner_id))::int orphans
  from public.decision_evidence d`)).rows[0]
say('BEFORE:', await state())
await c.query('BEGIN'); await c.query(readFileSync(`${W}/supabase/migrations/20260925b_decision_evidence_sweep.sql`, 'utf8')); await c.query('COMMIT')
say('APPLIED 20260925b. grants:', (await c.query(`select grantee from information_schema.routine_privileges where routine_schema='public' and routine_name='decision_evidence_sweep' order by 1`)).rows.map(r => r.grantee))
const n = (await c.query('select public.decision_evidence_sweep() as n')).rows[0].n
say('SWEEP deleted:', n)
const after = await state(); say('AFTER:', after)
const fk = async () => (await c.query(`select convalidated from pg_constraint where conname='decision_evidence_owner_id_fkey'`)).rows[0]?.convalidated
say('decision_evidence_owner_id_fkey validated before:', await fk())
if (after.orphans === 0) {
  await c.query('ALTER TABLE public.decision_evidence VALIDATE CONSTRAINT decision_evidence_owner_id_fkey')
  say('VALIDATE CONSTRAINT decision_evidence_owner_id_fkey (no orphan left; deletes nothing) → validated:', await fk())
}
await c.end()
writeFileSync(`${EV}/audit-apply-and-one-off-sweep.log`, log.join('\n') + '\n')
