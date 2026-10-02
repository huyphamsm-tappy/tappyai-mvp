import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// F-097 — decision_evidence had a 2-hour TTL and no sweep: an owner who never came back kept
// their rows forever (23 of 26 expired on audit, 2026-09-25). decision_evidence_sweep() is the
// sweep; this suite pins its whole contract on the REAL table migration:
//   · only rows past expires_at go — never an unexpired row, whoever owns it
//   · p_limit bounds one call, oldest first
//   · service_role only — anon and authenticated cannot trigger a global delete
// Synthetic owners only (RUNBOOK §A R11).
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const TABLE = read('supabase/migrations/20260824_decision_evidence_state.sql')
const SWEEP = read('supabase/migrations/20260925b_decision_evidence_sweep.sql')
const ROLLBACK = read('supabase/migrations/rollback/20260925b_decision_evidence_sweep_rollback.sql')

const PORT = 54394
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const PLATFORM = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
`

let pg: EmbeddedPostgres
let dataDir: string
let db: Client

const count = async (sql: string) => Number((await db.query(sql)).rows[0].c)
async function asRole(role: string, sql: string): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' }
  finally { await db.query('RESET ROLE') }
}
/** Rows: `expired` of them `hoursAgo` past expiry, `live` still valid, for owner. */
async function seed(owner: string, expired: number, live: number, hoursAgo = 3) {
  for (let i = 0; i < expired; i++) {
    await db.query(`INSERT INTO public.decision_evidence (id, owner_id, evidence, created_at, expires_at)
      VALUES (gen_random_uuid(), $1, '{"v":1}', now() - make_interval(hours => $2 + 2), now() - make_interval(hours => $2, mins => $3))`, [owner, hoursAgo, i])
  }
  for (let i = 0; i < live; i++) {
    await db.query(`INSERT INTO public.decision_evidence (id, owner_id, evidence, expires_at) VALUES (gen_random_uuid(), $1, '{"v":1}', now() + interval '90 minutes')`, [owner])
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'decision-evidence-sweep-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('sweep')
  const { Client: PgClient } = await import('pg')
  db = new PgClient({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'sweep' })
  await db.connect()
  await db.query(PLATFORM)
  await db.query(TABLE)
  await db.query(SWEEP)
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* file locks */ }
})

describe('decision_evidence_sweep — only expired rows, bounded, service_role only', () => {
  it('deletes every expired row and no unexpired one, for every owner', async () => {
    await seed(A, 3, 2)
    await seed(B, 1, 1)
    const n = Number((await db.query('SELECT public.decision_evidence_sweep() AS n')).rows[0].n)
    expect(n).toBe(4)
    expect(await count(`SELECT count(*) c FROM public.decision_evidence WHERE expires_at < now()`)).toBe(0)
    expect(await count(`SELECT count(*) c FROM public.decision_evidence WHERE owner_id = '${A}'`)).toBe(2)
    expect(await count(`SELECT count(*) c FROM public.decision_evidence WHERE owner_id = '${B}'`)).toBe(1)
  })

  it('p_limit bounds one call, oldest expiry first', async () => {
    await db.query('DELETE FROM public.decision_evidence')
    await seed(A, 2, 0, 10) // oldest
    await seed(B, 2, 0, 1)
    expect(Number((await db.query('SELECT public.decision_evidence_sweep(2) AS n')).rows[0].n)).toBe(2)
    expect(await count(`SELECT count(*) c FROM public.decision_evidence WHERE owner_id = '${A}'`)).toBe(0)
    expect(await count(`SELECT count(*) c FROM public.decision_evidence WHERE owner_id = '${B}'`)).toBe(2)
  })

  it('a non-positive or NULL limit deletes nothing', async () => {
    const before = await count('SELECT count(*) c FROM public.decision_evidence')
    for (const l of ['0', '-1', 'NULL']) expect(Number((await db.query(`SELECT public.decision_evidence_sweep(${l}) AS n`)).rows[0].n)).toBe(0)
    expect(await count('SELECT count(*) c FROM public.decision_evidence')).toBe(before)
  })

  it('🚨 anon and authenticated cannot call it; service_role can', async () => {
    expect(await asRole('anon', 'SELECT public.decision_evidence_sweep()')).toBe('42501')
    expect(await asRole('authenticated', 'SELECT public.decision_evidence_sweep()')).toBe('42501')
    expect(await asRole('service_role', 'SELECT public.decision_evidence_sweep()')).toBeNull()
  })

  it('rollback drops only the function', async () => {
    const rows = await count('SELECT count(*) c FROM public.decision_evidence')
    await db.query(ROLLBACK)
    expect(await count(`SELECT count(*) c FROM pg_proc WHERE proname = 'decision_evidence_sweep'`)).toBe(0)
    expect(await count('SELECT count(*) c FROM public.decision_evidence')).toBe(rows)
  })
})
