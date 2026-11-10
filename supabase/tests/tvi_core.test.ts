import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// TVI core (20261120_tvi_core.sql): the fact store, its lifecycle and its write paths, proven at the DATABASE.
const REPO = join(__dirname, '..', '..')
const MIG = readFileSync(join(REPO, 'supabase/migrations/20261120_tvi_core.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261120_tvi_core_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`
const PORT = 54327 // unique across supabase/tests (portAllocation.test.ts)
const H = (c: string) => c.repeat(64).slice(0, 64) // a 64-hex content hash
const NOW = '2026-11-10T08:00:00Z'

let pg: EmbeddedPostgres
let db: Client
let db2: Client
let dataDir: string

async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE); await db.query(MIG)
}

/** tvi_stage_fact with sensible defaults: one entity ("quan-a"), one fact type ("opening_hours"). */
function stage(client: Client, over: { value?: unknown; hash?: string; key?: string; type?: string; subject?: string } = {}) {
  return client.query(
    `SELECT * FROM public.tvi_stage_fact('VN','place',$1,'Quán A','Hà Nội',$2,$3,$4::jsonb,NULL,$5,$5,NULL,NULL,NULL,'opening_hours.v1',$6,'test')`,
    [over.key ?? 'place:quan-a', over.type ?? 'opening_hours', over.subject ?? '', JSON.stringify(over.value ?? { open: '08:00', close: '22:00' }), NOW, over.hash ?? H('a')],
  ).then(r => r.rows[0] as { fact_id: string; version_id: string; version_number: number; outcome: string })
}
const state = async (factId: string) => (await db.query('SELECT * FROM public.knowledge_fact_state WHERE fact_id=$1', [factId])).rows[0]
const events = async (factId: string) => (await db.query('SELECT from_status, to_status, reason_code FROM public.knowledge_fact_events WHERE fact_id=$1 ORDER BY seq', [factId])).rows
const count = async (t: string) => (await db.query(`SELECT count(*)::int AS n FROM public.${t}`)).rows[0].n as number
async function errorOf(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' }
}
async function errorAs(role: string, sql: string): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgtvi-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
  db2 = pg.getPgClient('test'); await db2.connect()
}, 180_000)
afterAll(async () => {
  for (const c of [db, db2]) { try { await c?.end() } catch { /* closed */ } }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('staging', () => {
  beforeEach(async () => { await setup() })

  it('a first fact is created as version 1, CANDIDATE, with one history event', async () => {
    const r = await stage(db)
    expect(r.outcome).toBe('created')
    expect(r.version_number).toBe(1)
    expect(await count('knowledge_entities')).toBe(1)
    expect(await count('knowledge_facts')).toBe(1)
    expect(await count('knowledge_fact_versions')).toBe(1)
    const s = await state(r.fact_id)
    expect(s.status).toBe('CANDIDATE'); expect(s.verification_status).toBe('UNVERIFIED'); expect(s.row_version).toBe(1); expect(s.current_version_id).toBe(r.version_id)
    expect(await events(r.fact_id)).toEqual([{ from_status: null, to_status: 'CANDIDATE', reason_code: 'staged' }])
  })

  it('the same content again writes nothing', async () => {
    const a = await stage(db)
    const b = await stage(db)
    expect(b.outcome).toBe('unchanged')
    expect(b.fact_id).toBe(a.fact_id); expect(b.version_id).toBe(a.version_id)
    expect(await count('knowledge_fact_versions')).toBe(1)
    expect((await events(a.fact_id)).length).toBe(1)
    expect((await state(a.fact_id)).row_version).toBe(1)
  })

  it('new content for a fact that is still only a CANDIDATE replaces it: the older version stays as history, REJECTED', async () => {
    const a = await stage(db, { hash: H('a') })
    const b = await stage(db, { hash: H('b'), value: { open: '09:00', close: '21:00' } })
    expect(b.outcome).toBe('staged'); expect(b.version_number).toBe(2)
    expect(await count('knowledge_fact_versions')).toBe(2)
    const s = await state(a.fact_id)
    expect(s.current_version_id).toBe(b.version_id); expect(s.status).toBe('CANDIDATE')
    expect((await events(a.fact_id)).map(e => e.to_status)).toEqual(['CANDIDATE', 'REJECTED', 'CANDIDATE'])
  })

  it('a malformed content hash is refused', async () => {
    expect(await errorOf(() => stage(db, { hash: 'nothex' }))).toBe('22023')
  })

  it('facts of different type or subject under one entity are separate facts', async () => {
    const hours = await stage(db, { type: 'opening_hours', hash: H('a') })
    const price = await stage(db, { type: 'ticket_price', hash: H('b'), value: { vnd: 50000 } })
    const price2 = await stage(db, { type: 'ticket_price', subject: 'child', hash: H('c'), value: { vnd: 30000 } })
    expect(new Set([hours.fact_id, price.fact_id, price2.fact_id]).size).toBe(3)
    expect(await count('knowledge_entities')).toBe(1)
  })
})

describe('promotion, supersession and retirement', () => {
  beforeEach(async () => { await setup() })

  const promote = (factId: string, versionId: string, expected: number, verification = 'VERIFIED') =>
    db.query(`SELECT * FROM public.tvi_promote_fact($1,$2,$3,$4,'two_independent_sources','VERIFIER','v1',NULL)`, [factId, versionId, expected, verification]).then(r => r.rows[0] as { outcome: string; row_version: number })

  it('promotes a CANDIDATE to ACTIVE with its verification and an event', async () => {
    const a = await stage(db)
    const p = await promote(a.fact_id, a.version_id, 1)
    expect(p).toEqual({ outcome: 'promoted', row_version: 2 })
    const s = await state(a.fact_id)
    expect(s.status).toBe('ACTIVE'); expect(s.verification_status).toBe('VERIFIED'); expect(s.row_version).toBe(2)
    expect((await events(a.fact_id)).pop()).toEqual({ from_status: 'CANDIDATE', to_status: 'ACTIVE', reason_code: 'two_independent_sources' })
  })

  it('new content for an ACTIVE fact waits as the candidate; the active version keeps serving until the promotion', async () => {
    const a = await stage(db, { hash: H('a') })
    await promote(a.fact_id, a.version_id, 1)
    const b = await stage(db, { hash: H('b'), value: { open: '10:00', close: '20:00' } })
    expect(b.outcome).toBe('staged')
    let s = await state(a.fact_id)
    expect(s.current_version_id).toBe(a.version_id); expect(s.candidate_version_id).toBe(b.version_id); expect(s.status).toBe('ACTIVE')
    const p = await promote(a.fact_id, b.version_id, s.row_version)
    expect(p.outcome).toBe('promoted')
    s = await state(a.fact_id)
    expect(s.current_version_id).toBe(b.version_id); expect(s.candidate_version_id).toBeNull(); expect(s.status).toBe('ACTIVE')
    const ev = await events(a.fact_id)
    expect(ev.some(e => e.from_status === 'ACTIVE' && e.to_status === 'SUPERSEDED')).toBe(true)
    // the old version row is still there, unchanged
    expect(await count('knowledge_fact_versions')).toBe(2)
  })

  it('a newer candidate replaces a pending one (which is rejected)', async () => {
    const a = await stage(db, { hash: H('a') })
    await promote(a.fact_id, a.version_id, 1)
    const b = await stage(db, { hash: H('b'), value: 1 })
    const c = await stage(db, { hash: H('c'), value: 2 })
    expect(c.outcome).toBe('staged')
    expect((await state(a.fact_id)).candidate_version_id).toBe(c.version_id)
    expect((await events(a.fact_id)).filter(e => e.reason_code === 'replaced_by_newer_candidate').length).toBe(1)
    expect(b.version_id).not.toBe(c.version_id)
  })

  it('compare-and-set: a stale row_version is a conflict and changes nothing; a version that is not pending is refused', async () => {
    const a = await stage(db)
    const stale = await promote(a.fact_id, a.version_id, 99)
    expect(stale.outcome).toBe('conflict')
    expect((await state(a.fact_id)).status).toBe('CANDIDATE')
    await promote(a.fact_id, a.version_id, 1)
    const again = await promote(a.fact_id, a.version_id, 2)
    expect(again.outcome).toBe('not_pending')
    expect(await errorOf(() => promote(a.fact_id, a.version_id, 2, 'UNVERIFIED'))).toBe('22023')
  })

  it('retires the current version as EXPIRED or REJECTED once; retiring again is refused', async () => {
    const a = await stage(db)
    await promote(a.fact_id, a.version_id, 1)
    const r = (await db.query(`SELECT * FROM public.tvi_retire_fact($1,2,'EXPIRED','past_valid_until','SYSTEM',NULL)`, [a.fact_id])).rows[0]
    expect(r).toEqual({ outcome: 'retired', row_version: 3 })
    expect((await state(a.fact_id)).status).toBe('EXPIRED')
    expect((await db.query(`SELECT outcome FROM public.tvi_retire_fact($1,3,'REJECTED','x','ADMIN',NULL)`, [a.fact_id])).rows[0].outcome).toBe('not_current')
    expect(await errorOf(() => db.query(`SELECT * FROM public.tvi_retire_fact($1,3,'ACTIVE','x','ADMIN',NULL)`, [a.fact_id]))).toBe('22023')
  })
})

describe('append-only history', () => {
  beforeEach(async () => { await setup() })

  it('a fact version and the lifecycle log can never be updated, and are deleted only inside an explicit purge', async () => {
    const a = await stage(db)
    expect(await errorOf(() => db.query(`UPDATE public.knowledge_fact_versions SET value='{"x":1}'::jsonb WHERE id=$1`, [a.version_id]))).toBe('42501')
    expect(await errorOf(() => db.query(`UPDATE public.knowledge_fact_events SET reason_code='x'`))).toBe('42501')
    expect(await errorOf(() => db.query(`DELETE FROM public.knowledge_fact_versions WHERE id=$1`, [a.version_id]))).toBe('42501')
    expect(await errorOf(() => db.query(`DELETE FROM public.knowledge_fact_events`))).toBe('42501')
    await db.query('BEGIN')
    await db.query(`SET LOCAL tvi.purge = 'on'`)
    await db.query(`DELETE FROM public.knowledge_entities`)
    await db.query('COMMIT')
    expect(await count('knowledge_fact_versions')).toBe(0)
    expect(await count('knowledge_fact_events')).toBe(0)
  })
})

describe('concurrent writers', () => {
  beforeEach(async () => { await setup() })

  it('two writers staging the same new fact with the same content create it once', async () => {
    const [x, y] = await Promise.all([stage(db, { hash: H('a') }), stage(db2, { hash: H('a') })])
    expect([x.outcome, y.outcome].sort()).toEqual(['created', 'unchanged'])
    expect(await count('knowledge_facts')).toBe(1)
    expect(await count('knowledge_fact_versions')).toBe(1)
  })

  it('two writers staging different content get consecutive version numbers, never the same one', async () => {
    const [x, y] = await Promise.all([stage(db, { hash: H('a'), value: 1 }), stage(db2, { hash: H('b'), value: 2 })])
    expect([x.version_number, y.version_number].sort()).toEqual([1, 2])
    expect(await count('knowledge_fact_versions')).toBe(2)
    expect(await count('knowledge_facts')).toBe(1)
  })

  it('two concurrent promotions of the same version: one wins, the other sees a conflict', async () => {
    const a = await stage(db)
    const go = (c: Client) => c.query(`SELECT * FROM public.tvi_promote_fact($1,$2,1,'VERIFIED','r','VERIFIER','v1',NULL)`, [a.fact_id, a.version_id]).then(r => r.rows[0].outcome as string)
    const out = (await Promise.all([go(db), go(db2)])).sort()
    expect(out).toEqual(['conflict', 'promoted'])
  })
})

describe('evidence and the storage permission', () => {
  beforeEach(async () => { await setup() })

  it('text may be stored only where the source allows it; the default stores a reference and a hash', async () => {
    const src = (await db.query(`INSERT INTO public.knowledge_sources (source_type, canonical_domain) VALUES ('OFFICIAL_BUSINESS','quana.vn') RETURNING id`)).rows[0].id
    const ins = (perm: string, excerpt: string | null) => db.query(
      `INSERT INTO public.knowledge_evidence (source_id, external_reference, content_hash, excerpt, retrieved_at, storage_permission, policy_version) VALUES ($1,'https://quana.vn/gio-mo-cua',$2,$3,now(),$4,'p1')`, [src, H('e'), excerpt, perm])
    expect(await errorOf(() => ins('REFERENCE_ONLY', 'Mở cửa 8h-22h'))).toBe('23514')
    expect(await errorOf(() => ins('UNKNOWN', 'x'))).toBe('23514')
    expect(await errorOf(() => ins('REFERENCE_ONLY', null))).toBeNull()
    expect(await errorOf(() => ins('EXCERPT_ALLOWED', 'Mở cửa 8h-22h'))).toBeNull()
    expect(await errorOf(() => ins('EXCERPT_ALLOWED', 'x'.repeat(2001)))).toBe('23514')
  })

  it('a version has its evidence by relation; the same evidence may support one version and qualify another', async () => {
    const a = await stage(db)
    const src = (await db.query(`INSERT INTO public.knowledge_sources (source_type) VALUES ('NEWS') RETURNING id`)).rows[0].id
    const ev = (await db.query(`INSERT INTO public.knowledge_evidence (source_id, retrieved_at, policy_version) VALUES ($1, now(), 'p1') RETURNING id`, [src])).rows[0].id
    await db.query(`INSERT INTO public.knowledge_fact_evidence (fact_version_id, evidence_id, relation, evaluator_version) VALUES ($1,$2,'SUPPORTS','e1')`, [a.version_id, ev])
    await db.query(`INSERT INTO public.knowledge_fact_evidence (fact_version_id, evidence_id, relation, evaluator_version) VALUES ($1,$2,'QUALIFIES','e1')`, [a.version_id, ev])
    expect(await errorOf(() => db.query(`INSERT INTO public.knowledge_fact_evidence (fact_version_id, evidence_id, relation, evaluator_version) VALUES ($1,$2,'SUPPORTS','e2')`, [a.version_id, ev]))).toBe('23505')
    expect(await errorOf(() => db.query(`INSERT INTO public.knowledge_fact_evidence (fact_version_id, evidence_id, relation, evaluator_version) VALUES ($1,$2,'MAYBE','e1')`, [a.version_id, ev]))).toBe('23514')
  })
})

describe('access', () => {
  beforeEach(async () => { await setup() })

  it('RLS is on for every table; anon and signed-in users can read, write and call nothing; the service role can', async () => {
    const tables = ['knowledge_sources', 'knowledge_entities', 'knowledge_facts', 'knowledge_fact_versions', 'knowledge_fact_state', 'knowledge_fact_events', 'knowledge_evidence', 'knowledge_fact_evidence']
    for (const t of tables) {
      expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname=$1`, [t])).rows[0].relrowsecurity, t).toBe(true)
      for (const role of ['anon', 'authenticated']) expect(await errorAs(role, `SELECT * FROM public.${t}`), `${role} ${t}`).toBe('42501')
    }
    const call = `SELECT * FROM public.tvi_stage_fact('VN','place','place:b','B',NULL,'x','', '1'::jsonb,NULL,now(),now(),NULL,NULL,NULL,'p','${H('b')}','t')`
    for (const role of ['anon', 'authenticated']) expect(await errorAs(role, call), role).toBe('42501')
    expect(await errorAs('service_role', call)).toBeNull()
  })

  it('is idempotent and the rollback removes the store', async () => {
    await stage(db)
    await db.query(MIG) // a second time: nothing is lost
    expect(await count('knowledge_fact_versions')).toBe(1)
    await db.query(ROLLBACK)
    expect((await db.query(`SELECT to_regclass('public.knowledge_facts') AS t`)).rows[0].t).toBeNull()
    expect((await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'tvi_%'`)).rows[0].n).toBe(0)
    await db.query(ROLLBACK) // runs twice
  })
})
