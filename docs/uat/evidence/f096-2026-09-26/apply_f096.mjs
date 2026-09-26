import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const EV = `${W}/docs/uat/evidence/f096-2026-09-26`; mkdirSync(EV, { recursive: true })
const pg = createRequire(W + '/package.json')('pg')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const ref = (e.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc') { console.error('REFUSING', ref); process.exit(2) }
const log = []; const say = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); log.push(s); console.log(s) }
say(`PRE-FLIGHT CHECK 2: target ${ref} = AUDIT (non-prod). Applying 20260925c + 20260925d, each in one transaction.`)
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
c.on('notice', n => say(`  ${n.severity}: ${n.message}`))
await c.connect()
const state = async () => ({
  fk: (await c.query(`select conrelid::regclass||'.'||a.attname||'='||confdeltype::text x from pg_constraint k join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1] where contype='f' and confrelid='auth.users'::regclass and ((conrelid='public.shared_results'::regclass and a.attname='owner_id') or (conrelid='public.notifications'::regclass and a.attname='actor_id'))`)).rows.map(r => r.x),
  trg: (await c.query(`select tgname from pg_trigger where tgname in ('trg_enqueue_account_deletion','aaa_audit_log_pii') order by 1`)).rows.map(r => r.tgname),
  chainProblems: (await c.query('select count(*)::int n from fn_verify_audit_chain()')).rows[0].n,
  auditRows: (await c.query('select count(*)::int n from public.audit_log')).rows[0].n,
})
say('BEFORE:', await state())
for (const f of ['20260925c_account_deletion_f096.sql', '20260925d_audit_log_pii_retention.sql']) {
  try { await c.query('BEGIN'); await c.query(readFileSync(`${W}/supabase/migrations/${f}`, 'utf8')); await c.query('COMMIT'); say('APPLIED', f) }
  catch (err) { await c.query('ROLLBACK').catch(() => {}); say('FAILED (rolled back)', f, String(err.message).slice(0, 300)); process.exitCode = 1 }
}
say('AFTER :', await state())
await c.end()
writeFileSync(`${EV}/apply-20260925c-d.log`, log.join('\n') + '\n')
