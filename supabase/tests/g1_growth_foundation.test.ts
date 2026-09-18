import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// G1 growth foundation — `shared_results`, `anon_identity_map`,
// `fn_shared_result_bump`, against a REAL PostgreSQL running the ACTUAL
// migration file, under the platform's real default ACLs (ADR-019).
//
// What is proved here:
//   · a client role can never INSERT a public share (sanitization cannot be bypassed)
//   · anon cannot read the table at all; the public page reads via service_role
//   · the owner can read and withdraw their own share, and no one else's
//   · the frozen payload cannot be edited — even by its owner (column grant)
//   · the counter function is reachable by service_role only
//   · anon_identity_map is closed to every client role
//   · the rollback drops exactly what the migration created
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260913_g1_growth_foundation.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260913_g1_growth_foundation_rollback.sql'), 'utf8')
const ANCESTRY = readFileSync(join(REPO, 'supabase/migrations/20260918_g1b_share_ancestry.sql'), 'utf8')
const ANCESTRY_ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260918_g1b_share_ancestry_rollback.sql'), 'utf8')

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const PORT = 54379

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, is_anonymous BOOLEAN NOT NULL DEFAULT false);
  GRANT SELECT ON auth.users TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  INSERT INTO auth.users (id) VALUES ('${ALICE}'), ('${BOB}');
`

const PAYLOAD = JSON.stringify({ v: 1, title: 'T', query: 'q', domain: 'food', locale: 'vi', body: 'b', buttons: [], images: [], suggestedQuestions: [], createdAt: '2026-09-13T00:00:00Z' })

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function asSession(uid: string | null) {
  if (uid === null) { await db.query(`SELECT set_config('request.jwt.claims', '', false)`); return }
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
}

/** Runs `sql` as `role`; returns the PG error code, or null on success. */
async function asRole(role: string, sql: string, params: unknown[] = []): Promise<{ code: string | null; rows: Record<string, unknown>[] }> {
  try {
    await db.query(`SET ROLE ${role}`)
    const r = await db.query(sql, params)
    return { code: null, rows: r.rows }
  } catch (e) {
    return { code: (e as { code?: string }).code ?? 'unknown', rows: [] }
  } finally {
    await db.query('RESET ROLE')
  }
}

async function seedShare(slug: string, owner: string | null): Promise<void> {
  await db.query(`INSERT INTO public.shared_results (slug, owner_id, query, payload, domain) VALUES ($1, $2, 'q', $3::jsonb, 'food')`, [slug, owner, PAYLOAD])
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgg1-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
})

beforeEach(async () => {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(MIGRATION)
  await db.query(ANCESTRY)
  await asSession(null)
})

describe('migration', () => {
  it('is idempotent (both files)', async () => {
    await expect(db.query(MIGRATION)).resolves.toBeDefined()
    await expect(db.query(ANCESTRY)).resolves.toBeDefined()
  })
  it('creates the objects with their indexes and RLS on', async () => {
    const { rows } = await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('shared_results','anon_identity_map') ORDER BY relname`)
    expect(rows).toEqual([{ relname: 'anon_identity_map', relrowsecurity: true }, { relname: 'shared_results', relrowsecurity: true }])
    const idx = await db.query(`SELECT indexname FROM pg_indexes WHERE tablename='shared_results' ORDER BY indexname`)
    expect(idx.rows.map(r => r.indexname)).toEqual(expect.arrayContaining(['shared_results_slug_key', 'shared_results_owner_idx', 'shared_results_public_domain_idx']))
  })
  it('enforces the status check and slug uniqueness', async () => {
    await seedShare('AbCdEfGh12', ALICE)
    await expect(seedShare('AbCdEfGh12', BOB)).rejects.toMatchObject({ code: '23505' })
    await expect(db.query(`UPDATE public.shared_results SET status='draft'`)).rejects.toMatchObject({ code: '23514' })
  })
})

describe('shared_results — the write boundary', () => {
  it('no client role can INSERT: sanitization cannot be bypassed', async () => {
    await asSession(ALICE)
    for (const role of ['anon', 'authenticated']) {
      const r = await asRole(role, `INSERT INTO public.shared_results (slug, owner_id, query, payload) VALUES ('ZzZzZzZzZ1', '${ALICE}', 'q', '${PAYLOAD}'::jsonb)`)
      expect(r.code, role).toBe('42501')
    }
  })
  it('service_role inserts (the API route path)', async () => {
    const r = await asRole('service_role', `INSERT INTO public.shared_results (slug, owner_id, query, payload) VALUES ('ZzZzZzZzZ1', '${ALICE}', 'q', '${PAYLOAD}'::jsonb)`)
    expect(r.code).toBeNull()
  })
})

describe('shared_results — the read boundary', () => {
  beforeEach(async () => { await seedShare('AbCdEfGh12', ALICE); await seedShare('BbBbBbBbB2', BOB); await seedShare('NoOwner001', null) })

  it('anon cannot read the table at all (public reads go through the server projection)', async () => {
    await asSession(null)
    expect((await asRole('anon', 'SELECT slug FROM public.shared_results')).code).toBe('42501')
  })
  it('an authenticated user sees only their own shares', async () => {
    await asSession(ALICE)
    const r = await asRole('authenticated', 'SELECT slug FROM public.shared_results ORDER BY slug')
    expect(r.code).toBeNull()
    expect(r.rows.map(x => x.slug)).toEqual(['AbCdEfGh12'])
  })
  it('service_role reads everything, including ownerless rows', async () => {
    const r = await asRole('service_role', 'SELECT slug FROM public.shared_results ORDER BY slug')
    expect(r.rows.map(x => x.slug)).toEqual(['AbCdEfGh12', 'BbBbBbBbB2', 'NoOwner001'])
  })
})

describe('shared_results — frozen payload, owner withdrawal', () => {
  beforeEach(async () => { await seedShare('AbCdEfGh12', ALICE); await seedShare('BbBbBbBbB2', BOB) })

  it('the owner can withdraw (status → removed) their own share', async () => {
    await asSession(ALICE)
    const r = await asRole('authenticated', `UPDATE public.shared_results SET status='removed', updated_at=now() WHERE slug='AbCdEfGh12' RETURNING slug`)
    expect(r.code).toBeNull(); expect(r.rows).toHaveLength(1)
  })
  it("the owner cannot withdraw someone else's share (0 rows, not an error)", async () => {
    await asSession(ALICE)
    const r = await asRole('authenticated', `UPDATE public.shared_results SET status='removed' WHERE slug='BbBbBbBbB2' RETURNING slug`)
    expect(r.code).toBeNull(); expect(r.rows).toHaveLength(0)
  })
  it('the frozen payload cannot be edited, even by its owner — column grant', async () => {
    await asSession(ALICE)
    const r = await asRole('authenticated', `UPDATE public.shared_results SET payload='{}'::jsonb WHERE slug='AbCdEfGh12'`)
    expect(r.code).toBe('42501')
    const q = await asRole('authenticated', `UPDATE public.shared_results SET query='changed' WHERE slug='AbCdEfGh12'`)
    expect(q.code).toBe('42501')
  })
  it('a client can never DELETE a row (attribution history is kept)', async () => {
    await asSession(ALICE)
    expect((await asRole('authenticated', `DELETE FROM public.shared_results WHERE slug='AbCdEfGh12'`)).code).toBe('42501')
  })
})

describe('fn_shared_result_bump', () => {
  beforeEach(async () => { await seedShare('AbCdEfGh12', ALICE) })

  it('is reachable by service_role only — not anon, not authenticated', async () => {
    await asSession(ALICE)
    expect((await asRole('anon', `SELECT public.fn_shared_result_bump('AbCdEfGh12','view',1)`)).code).toBe('42501')
    expect((await asRole('authenticated', `SELECT public.fn_shared_result_bump('AbCdEfGh12','view',1)`)).code).toBe('42501')
    expect((await asRole('service_role', `SELECT public.fn_shared_result_bump('AbCdEfGh12','view',1)`)).code).toBeNull()
  })
  it('increments view and ask atomically, ignores withdrawn rows, rejects bad input', async () => {
    await asRole('service_role', `SELECT public.fn_shared_result_bump('AbCdEfGh12','view',3)`)
    await asRole('service_role', `SELECT public.fn_shared_result_bump('AbCdEfGh12','ask',1)`)
    let r = await db.query(`SELECT view_count, ask_count FROM public.shared_results WHERE slug='AbCdEfGh12'`)
    expect(r.rows[0]).toEqual({ view_count: 3, ask_count: 1 })
    await db.query(`UPDATE public.shared_results SET status='removed' WHERE slug='AbCdEfGh12'`)
    await asRole('service_role', `SELECT public.fn_shared_result_bump('AbCdEfGh12','view',1)`)
    r = await db.query(`SELECT view_count FROM public.shared_results WHERE slug='AbCdEfGh12'`)
    expect(r.rows[0].view_count).toBe(3)
    expect((await asRole('service_role', `SELECT public.fn_shared_result_bump('AbCdEfGh12','delete',1)`)).code).toBe('P0001')
    expect((await asRole('service_role', `SELECT public.fn_shared_result_bump('AbCdEfGh12','view',0)`)).code).toBe('P0001')
    expect((await asRole('service_role', `SELECT public.fn_shared_result_bump('AbCdEfGh12','view',5000)`)).code).toBe('P0001')
  })
})

describe('anon_identity_map', () => {
  it('is closed to every client role and open to service_role', async () => {
    await asSession(ALICE)
    for (const role of ['anon', 'authenticated']) {
      expect((await asRole(role, `SELECT * FROM public.anon_identity_map`)).code, `${role} select`).toBe('42501')
      expect((await asRole(role, `INSERT INTO public.anon_identity_map (anon_id, user_id) VALUES ('${BOB}', '${ALICE}')`)).code, `${role} insert`).toBe('42501')
    }
    expect((await asRole('service_role', `INSERT INTO public.anon_identity_map (anon_id, user_id) VALUES ('${BOB}', '${ALICE}') ON CONFLICT DO NOTHING`)).code).toBeNull()
  })
  it('one anon may map to one user; a deleted user cascades', async () => {
    await db.query(`INSERT INTO public.anon_identity_map (anon_id, user_id) VALUES ('${BOB}', '${ALICE}')`)
    await expect(db.query(`INSERT INTO public.anon_identity_map (anon_id, user_id) VALUES ('${BOB}', '${ALICE}')`)).rejects.toMatchObject({ code: '23505' })
    await db.query(`DELETE FROM auth.users WHERE id='${ALICE}'`)
    expect((await db.query(`SELECT count(*)::int AS n FROM public.anon_identity_map`)).rows[0].n).toBe(0)
  })
})

describe('share ancestry (G1-B)', () => {
  it('adds parent_id (self-FK, SET NULL) and owner_is_anonymous (default false) with their indexes', async () => {
    await seedShare('AbCdEfGh12', ALICE)
    await db.query(`INSERT INTO public.shared_results (slug, owner_id, query, payload, parent_id, owner_is_anonymous)
      SELECT 'ZzZzZzZzZ2', NULL, 'q', $1::jsonb, id, true FROM public.shared_results WHERE slug='AbCdEfGh12'`, [PAYLOAD])
    const child = await db.query(`SELECT owner_is_anonymous, parent_id IS NOT NULL AS has_parent FROM public.shared_results WHERE slug='ZzZzZzZzZ2'`)
    expect(child.rows[0]).toEqual({ owner_is_anonymous: true, has_parent: true })
    const def = await db.query(`SELECT owner_is_anonymous FROM public.shared_results WHERE slug='AbCdEfGh12'`)
    expect(def.rows[0].owner_is_anonymous).toBe(false)
    // Deleting the parent orphans the child rather than deleting it (attribution history kept).
    await db.query(`DELETE FROM public.shared_results WHERE slug='AbCdEfGh12'`)
    const orphan = await db.query(`SELECT parent_id FROM public.shared_results WHERE slug='ZzZzZzZzZ2'`)
    expect(orphan.rows[0].parent_id).toBeNull()
    const idx = await db.query(`SELECT indexname FROM pg_indexes WHERE tablename='shared_results'`)
    expect(idx.rows.map(r => r.indexname)).toEqual(expect.arrayContaining(['shared_results_parent_idx', 'shared_results_listed_idx']))
  })
  it('a client role still cannot INSERT or edit ancestry (write path unchanged)', async () => {
    await asSession(ALICE)
    await seedShare('AbCdEfGh12', ALICE)
    expect((await asRole('authenticated', `UPDATE public.shared_results SET owner_is_anonymous=true WHERE slug='AbCdEfGh12'`)).code).toBe('42501')
    expect((await asRole('anon', `INSERT INTO public.shared_results (slug, query, payload, owner_is_anonymous) VALUES ('ZzZzZzZzZ3','q','${PAYLOAD}'::jsonb, true)`)).code).toBe('42501')
  })
  it('its rollback removes exactly the two columns and two indexes', async () => {
    await db.query(ANCESTRY_ROLLBACK)
    const cols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='shared_results' AND column_name IN ('parent_id','owner_is_anonymous')`)
    expect(cols.rows).toHaveLength(0)
    const still = await db.query(`SELECT 1 FROM public.shared_results`)
    expect(still.rowCount).toBe(0)
  })
})

describe('rollback', () => {
  it('drops exactly what the migration created', async () => {
    await db.query(ANCESTRY_ROLLBACK)
    await db.query(ROLLBACK)
    const { rows } = await db.query(`SELECT relname FROM pg_class WHERE relname IN ('shared_results','anon_identity_map')`)
    expect(rows).toHaveLength(0)
    const fn = await db.query(`SELECT proname FROM pg_proc WHERE proname='fn_shared_result_bump'`)
    expect(fn.rows).toHaveLength(0)
    const still = await db.query(`SELECT 1 FROM auth.users`)
    expect(still.rowCount).toBe(2)
  })
})
