import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard'
const pg = createRequire(W + '/package.json')('pg')
const e = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const ref = (e.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (ref !== 'zdaprdfgpbpnxyofagmc' || ref === 'fwznnobrdctuskgrvuik') { console.error('REFUSING: ref', ref); process.exit(2) }
const file = process.argv[2]
console.log('PRE-FLIGHT CHECK 2: target', ref, '= AUDIT (non-prod). Applying', file, 'in one transaction.')
const c = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: e.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } })
c.on('notice', n => console.log(`  ${n.severity}: ${n.message}`))
await c.connect()
const state = async () => ({
  col: (await c.query(`select table_name||'.'||column_name||' '||data_type c from information_schema.columns where table_schema='public' and ((table_name='user_memory' and column_name='user_id') or (table_name='decision_evidence' and column_name='owner_id') or (table_name='anon_chat_usage' and column_name='user_id'))`)).rows.map(r => r.c),
  fks: (await c.query(`select conrelid::regclass||'.'||conname||' '||pg_get_constraintdef(oid)||' valid='||convalidated c from pg_constraint where contype='f' and conrelid::regclass::text in ('user_memory','decision_evidence','anon_chat_usage')`)).rows.map(r => r.c),
  policies: (await c.query(`select policyname||' '||cmd p from pg_policies where schemaname='public' and tablename='user_memory' order by 1`)).rows.map(r => r.p),
  rows: (await c.query(`select (select count(*) from public.user_memory)::int user_memory, (select count(*) from public.decision_evidence)::int decision_evidence, (select count(*) from public.anon_chat_usage)::int anon_chat_usage`)).rows[0],
})
console.log('BEFORE:', JSON.stringify(await state(), null, 1))
const sql = readFileSync(`${W}/supabase/migrations/${file}`, 'utf8')
try { await c.query('BEGIN'); await c.query(sql); await c.query('COMMIT'); console.log('APPLIED') } catch (err) { await c.query('ROLLBACK').catch(() => {}); console.log('FAILED (rolled back)', String(err.message).slice(0, 400)); process.exitCode = 1 }
console.log('AFTER :', JSON.stringify(await state(), null, 1))
await c.end()
