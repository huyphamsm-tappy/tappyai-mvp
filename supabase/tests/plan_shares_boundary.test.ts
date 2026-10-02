import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ── plan_shares — the boundary a published plan link lives behind ───────────
//
// Asserted against the REAL migration from disk, on a real PostgreSQL with the
// Supabase roles and default privileges reproduced. The properties:
//
//   1. A recipient (anon, or any signed-in user) reads a snapshot ONLY through
//      `plan_share_public`, and gets exactly id / plan / created_at — never
//      the owner, never the fingerprint, never a listing.
//   2. The table is owner-only: no anon access at all; a signed-in user sees
//      and deletes only their own rows; nobody updates a published snapshot.
//   3. An anonymous SESSION (role authenticated, is_anonymous: true) cannot
//      publish. `REVOKE FROM anon` would not have caught this; the JWT check does.
//   4. The wire format is enforced by the database: id shape, fingerprint
//      shape, plan is an object, plan is bounded, same plan → same row.
//
// The migration is executed verbatim; nothing here re-states its SQL.

const REPO = join(__dirname, '..', '..')
const MIG = readFileSync(join(REPO, 'supabase/migrations', '20260913_plan_shares.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback', '20260913_plan_shares_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;

  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE auth.users (id UUID PRIMARY KEY, email VARCHAR(255));
`

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const GUEST = '33333333-3333-3333-3333-333333333333'
const ID_A = 'AbCdEfGhIjK1'
const ID_B = 'ZyXwVuTsRqP2'
const FP_A = 'a'.repeat(64)
const FP_B = 'b'.repeat(64)
const PLAN = { v: 1, title: 'Quy Nhơn 3 ngày 2 đêm', days: [{ label: 'Ngày 1', items: [{ name: 'Bãi Kỳ Co', time: '09:00' }] }] }

// Unique across supabase/tests — portAllocation.test.ts enforces it.
const PORT = 54379

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function asSession(uid: string | null, isAnonymous = false) {
  await db.query(
    `SELECT set_config('request.jwt.claims', $1, false)`,
    [uid === null ? '' : JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: isAnonymous })],
  )
}

async function errorAs(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql, params as never[])
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('RESET ROLE')
  }
}

async function rowsAs<T = Record<string, unknown>>(role: string, sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    await db.query(`SET ROLE ${role}`)
    return (await db.query(sql, params as never[])).rows as T[]
  } finally {
    await db.query('RESET ROLE')
  }
}

const publish = (role: string, id: string, owner: string, fp: string, plan: unknown = PLAN) =>
  errorAs(role, 'INSERT INTO public.plan_shares (id, owner_id, fingerprint, plan) VALUES ($1,$2,$3,$4)', [id, owner, fp, JSON.stringify(plan)])

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgplsh-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--locale=C'],
  })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(MIG)
  for (const id of [A, B, GUEST]) await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [id, `${id}@example.com`])
  await asSession(null)
})

describe('the suite is not vacuous', () => {
  it('the migration applied, is idempotent, and created the objects under test', async () => {
    await db.query(MIG) // second run: IF NOT EXISTS everywhere
    const t = await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='plan_shares'`)
    expect(t.rows[0]?.relrowsecurity).toBe(true)
    const f = await db.query(`SELECT prosecdef FROM pg_proc WHERE proname='plan_share_public'`)
    expect(f.rows[0]?.prosecdef).toBe(true)
    // The platform default would have granted anon everything on the table; the migration closed it.
    const anonOnTable = await db.query(`SELECT has_table_privilege('anon', 'public.plan_shares', 'SELECT') AS s, has_table_privilege('anon', 'public.plan_shares', 'INSERT') AS i`)
    expect(anonOnTable.rows[0]).toEqual({ s: false, i: false })
  })
})

describe('publishing — owner only, real accounts only', () => {
  it('a signed-in owner publishes; the row is theirs', async () => {
    await asSession(A)
    expect(await publish('authenticated', ID_A, A, FP_A)).toBeNull()
    const mine = await rowsAs('authenticated', 'SELECT id FROM public.plan_shares')
    expect(mine.map(r => r.id)).toEqual([ID_A])
  })

  it('cannot publish under someone else’s owner_id', async () => {
    await asSession(A)
    expect(await publish('authenticated', ID_A, B, FP_A)).toBe('42501')
  })

  it('an anonymous SESSION cannot publish — the JWT claim, not the role, decides', async () => {
    await asSession(GUEST, true)
    expect(await publish('authenticated', ID_A, GUEST, FP_A)).toBe('42501')
    await asSession(null)
    expect(await publish('anon', ID_A, A, FP_A)).toBe('42501')
  })

  it('the same plan from the same owner is one row; a different owner may publish the same plan', async () => {
    await asSession(A)
    expect(await publish('authenticated', ID_A, A, FP_A)).toBeNull()
    expect(await publish('authenticated', ID_B, A, FP_A)).toBe('23505')
    await asSession(B)
    expect(await publish('authenticated', ID_B, B, FP_A)).toBeNull()
  })

  it('enforces the wire format: id shape, fingerprint shape, plan is a bounded object', async () => {
    await asSession(A)
    expect(await publish('authenticated', 'short', A, FP_A)).toBe('23514')
    expect(await publish('authenticated', 'AbCdEfGhIjK!', A, FP_A)).toBe('23514')
    expect(await publish('authenticated', ID_A, A, 'not-a-hash')).toBe('23514')
    expect(await publish('authenticated', ID_A, A, FP_A, ['not', 'an', 'object'])).toBe('23514')
    expect(await publish('authenticated', ID_A, A, FP_A, { v: 1, blob: 'x'.repeat(70_000) })).toBe('23514')
  })

  it('a published snapshot is immutable: no UPDATE for anyone but service_role', async () => {
    await asSession(A)
    await publish('authenticated', ID_A, A, FP_A)
    expect(await errorAs('authenticated', `UPDATE public.plan_shares SET plan = '{"v":1,"title":"x","days":[]}' WHERE id = $1`, [ID_A])).toBe('42501')
    expect(await errorAs('anon', `UPDATE public.plan_shares SET plan = '{}' WHERE id = $1`, [ID_A])).toBe('42501')
  })

  it('the owner can withdraw their link; nobody else can', async () => {
    await asSession(A)
    await publish('authenticated', ID_A, A, FP_A)
    await asSession(B)
    await rowsAs('authenticated', 'DELETE FROM public.plan_shares WHERE id = $1', [ID_A])
    expect((await db.query('SELECT count(*)::int AS n FROM public.plan_shares')).rows[0].n).toBe(1)
    await asSession(A)
    await rowsAs('authenticated', 'DELETE FROM public.plan_shares WHERE id = $1', [ID_A])
    expect((await db.query('SELECT count(*)::int AS n FROM public.plan_shares')).rows[0].n).toBe(0)
  })
})

describe('reading — recipients see the snapshot and only the snapshot', () => {
  beforeEach(async () => {
    await asSession(A)
    await publish('authenticated', ID_A, A, FP_A)
    await asSession(B)
    await publish('authenticated', ID_B, B, FP_B, { ...PLAN, title: 'Đà Lạt' })
    await asSession(null)
  })

  it('anon reads a snapshot by id through the function — three public columns, nothing else', async () => {
    const rows = await rowsAs('anon', 'SELECT * FROM public.plan_share_public($1)', [ID_A])
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['created_at', 'id', 'plan'])
    expect(rows[0].id).toBe(ID_A)
    expect(rows[0].plan).toEqual(PLAN)
    expect(JSON.stringify(rows[0])).not.toContain(A)
    expect(JSON.stringify(rows[0])).not.toContain(FP_A)
  })

  it('a signed-in stranger reads it the same way', async () => {
    await asSession(B)
    const rows = await rowsAs('authenticated', 'SELECT id FROM public.plan_share_public($1)', [ID_A])
    expect(rows.map(r => r.id)).toEqual([ID_A])
  })

  it('an unknown id is an empty result, not an error and not another row', async () => {
    expect(await rowsAs('anon', 'SELECT * FROM public.plan_share_public($1)', ['NoSuchPlan00'])).toEqual([])
    expect(await rowsAs('anon', 'SELECT * FROM public.plan_share_public($1)', [''])).toEqual([])
  })

  it('anon cannot touch the table itself — no read, no listing, no write', async () => {
    expect(await errorAs('anon', 'SELECT id FROM public.plan_shares')).toBe('42501')
    expect(await errorAs('anon', 'SELECT owner_id FROM public.plan_shares WHERE id = $1', [ID_A])).toBe('42501')
    expect(await errorAs('anon', 'DELETE FROM public.plan_shares')).toBe('42501')
  })

  it('a signed-in user sees only their own rows on the table — the other owner’s link is invisible there', async () => {
    await asSession(A)
    const mine = await rowsAs('authenticated', 'SELECT id, owner_id FROM public.plan_shares ORDER BY id')
    expect(mine).toEqual([{ id: ID_A, owner_id: A }])
    // …but reaches the other plan by its id, like any recipient would.
    expect((await rowsAs('authenticated', 'SELECT id FROM public.plan_share_public($1)', [ID_B]))[0]?.id).toBe(ID_B)
  })

  it('there is no way to enumerate: the function takes an exact id, and PUBLIC has no execute grant', async () => {
    const grants = await db.query(`
      SELECT has_function_privilege('anon', 'public.plan_share_public(text)', 'EXECUTE') AS anon,
             has_function_privilege('authenticated', 'public.plan_share_public(text)', 'EXECUTE') AS authenticated
    `)
    expect(grants.rows[0]).toEqual({ anon: true, authenticated: true })
    const acl = await db.query(`SELECT proacl::text AS acl FROM pg_proc WHERE proname='plan_share_public'`)
    // A PUBLIC grant would read as "=X/…" in the ACL: none.
    expect(acl.rows[0].acl).not.toMatch(/(^|,)=X\//)
  })
})

describe('rollback', () => {
  it('removes the function and the table, and nothing else', async () => {
    await db.query(ROLLBACK)
    expect((await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname='plan_share_public'`)).rows[0].n).toBe(0)
    expect((await db.query(`SELECT count(*)::int AS n FROM pg_class WHERE relname='plan_shares'`)).rows[0].n).toBe(0)
    expect((await db.query(`SELECT count(*)::int AS n FROM auth.users`)).rows[0].n).toBe(3)
  })
})
