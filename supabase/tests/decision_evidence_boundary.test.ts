import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// ADR-024 — decision_evidence must be reachable ONLY by its owner.
//
// Runs the ACTUAL migration from disk against a REAL PostgreSQL. Migration
// syntax succeeding proves nothing about who can read the table, and this
// project has already been burned by a suite that was green against a platform
// on which the vulnerability could not exist — so the prelude below installs the
// Supabase facts that make the assertions mean something:
//
//   · `anon` / `authenticated` / `service_role` exist;
//   · ALTER DEFAULT PRIVILEGES grants ALL ON FUNCTIONS to anon and authenticated,
//     which is what makes a bare `REVOKE ... FROM PUBLIC` insufficient here;
//   · auth.uid() reads request.jwt.claims rather than being a constant, so a
//     test can impersonate two different sessions in the same connection.
//
// 🚨 An anonymous Supabase session carries the `authenticated` Postgres role, so
// "anonymous user" below means a distinct auth.uid() ON that role — not `anon`.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260824_decision_evidence_state.sql'), 'utf8',
)

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;
`

const ALICE = '11111111-1111-1111-1111-111111111111'
const BOB = '22222222-2222-2222-2222-222222222222'
const GUEST_A = '33333333-3333-3333-3333-333333333333'
const GUEST_B = '44444444-4444-4444-4444-444444444444'
const ROW_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROW_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PORT = 54367

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Act as `authenticated` with a given auth.uid(), the way the RPCs are called live. */
async function asUser<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(
    `SELECT set_config('request.jwt.claims', $1, false)`,
    [uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : ''],
  )
  await db.query('SET ROLE authenticated')
  try { return await fn() } finally {
    await db.query('RESET ROLE')
    await db.query(`SELECT set_config('request.jwt.claims', '', false)`)
  }
}

const save = (id: string, evidence: object) =>
  db.query('SELECT public.decision_evidence_save($1, $2)', [id, JSON.stringify(evidence)])

const load = async (id: string) =>
  (await db.query('SELECT public.decision_evidence_load($1) AS e', [id])).rows[0].e

/** The error code a statement raises, or null when it succeeds. */
async function codeOf(sql: string): Promise<string | null> {
  try { await db.query(sql); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgdecev-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false,
    // --locale=C: the Windows runner's default collation is WIN1252 and initdb
    // refuses it. Same workaround as the existing suites.
    initdbFlags: ['--locale=C'],
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient('test')
  await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
})

beforeEach(async () => {
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(MIGRATION)
})

describe('ADR-024 — ownership is enforced, not assumed', () => {
  it('1. an owner loads their own evidence', async () => {
    await asUser(ALICE, () => save(ROW_A, { pick: 'alice' }))
    const got = await asUser(ALICE, () => load(ROW_A))
    expect(got).toEqual({ pick: 'alice' })
  })

  it('2. another AUTHENTICATED user cannot load it — the IDOR case', async () => {
    await asUser(ALICE, () => save(ROW_A, { pick: 'alice' }))
    // Bob holds a valid id belonging to Alice. Holding it must grant nothing.
    const got = await asUser(BOB, () => load(ROW_A))
    expect(got).toBeNull()
  })

  it('3. an anonymous owner loads their own evidence', async () => {
    await asUser(GUEST_A, () => save(ROW_A, { pick: 'guest-a' }))
    expect(await asUser(GUEST_A, () => load(ROW_A))).toEqual({ pick: 'guest-a' })
  })

  it('4. another ANONYMOUS owner cannot load it', async () => {
    await asUser(GUEST_A, () => save(ROW_A, { pick: 'guest-a' }))
    expect(await asUser(GUEST_B, () => load(ROW_A))).toBeNull()
  })

  it('5. expired evidence returns NULL', async () => {
    await asUser(ALICE, () => save(ROW_A, { pick: 'alice' }))
    // Reach past the function to age the row — the point is the READ predicate.
    await db.query(`UPDATE public.decision_evidence SET expires_at = now() - interval '1 second'`)
    expect(await asUser(ALICE, () => load(ROW_A))).toBeNull()
  })

  it('6. an unknown id fails safely rather than erroring', async () => {
    expect(await asUser(ALICE, () => load(ROW_B))).toBeNull()
  })

  it('7. a caller with no session cannot save, and loads nothing', async () => {
    await expect(asUser(null, () => save(ROW_A, { pick: 'x' }))).rejects.toThrow()
    expect(await asUser(null, () => load(ROW_A))).toBeNull()
  })

  it('8. a second owner cannot overwrite an existing row', async () => {
    await asUser(ALICE, () => save(ROW_A, { pick: 'alice' }))
    // Bob writes the SAME id. The ON CONFLICT predicate must not let him through.
    await asUser(BOB, () => save(ROW_A, { pick: 'bob-was-here' }))
    expect(await asUser(ALICE, () => load(ROW_A))).toEqual({ pick: 'alice' })
    expect(await asUser(BOB, () => load(ROW_A))).toBeNull()
  })
})

describe('ADR-024 — the table itself is unreachable', () => {
  it('9. neither anon nor authenticated may touch the table directly', async () => {
    await asUser(ALICE, () => save(ROW_A, { pick: 'alice' }))
    for (const role of ['anon', 'authenticated']) {
      await db.query(`SET ROLE ${role}`)
      expect(await codeOf('SELECT * FROM public.decision_evidence'), `${role} SELECT`).toBe('42501')
      expect(await codeOf(`INSERT INTO public.decision_evidence (id, owner_id, evidence, expires_at)
                           VALUES ('${ROW_B}','${BOB}','{}'::jsonb, now() + interval '1 hour')`), `${role} INSERT`).toBe('42501')
      expect(await codeOf('DELETE FROM public.decision_evidence'), `${role} DELETE`).toBe('42501')
      await db.query('RESET ROLE')
    }
  })

  it('10. grants are exactly the intended set — privilege, not migration syntax', async () => {
    // 🚨 has_function_privilege is the only authority. A GRANT statement having
    // run says nothing about the ACL that survived the platform defaults.
    for (const fn of ['public.decision_evidence_save(uuid, jsonb)', 'public.decision_evidence_load(uuid)']) {
      const { rows } = await db.query(
        `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS authed,
                has_function_privilege('anon',          $1, 'EXECUTE') AS anon`, [fn],
      )
      expect(rows[0].authed, `${fn} → authenticated`).toBe(true)
      expect(rows[0].anon, `${fn} → anon`).toBe(false)
    }
  })

  it('11. RLS is on and no policy exists', async () => {
    const { rows: t } = await db.query(
      `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.decision_evidence'::regclass`)
    expect(t[0].relrowsecurity).toBe(true)
    const { rows: p } = await db.query(
      `SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'decision_evidence'`)
    expect(p[0].n).toBe(0)
  })
})

describe('ADR-024 — retention is bounded without a scheduler', () => {
  it('12. a caller keeps only their latest 3 rows', async () => {
    const ids = ['1', '2', '3', '4', '5'].map(n => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n.repeat(12)}`)
    for (const id of ids) {
      await asUser(ALICE, () => save(id, { id }))
      // created_at defaults to now(); nudge so the ORDER BY is deterministic.
      await db.query(`UPDATE public.decision_evidence SET created_at = now() WHERE id = $1`, [id])
    }
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM public.decision_evidence WHERE owner_id = $1`, [ALICE])
    expect(rows[0].n).toBe(3)
    // The newest survive; the first two are gone.
    expect(await asUser(ALICE, () => load(ids[4]))).not.toBeNull()
    expect(await asUser(ALICE, () => load(ids[0]))).toBeNull()
  })

  it('13. pruning is caller-scoped — one user cannot evict another', async () => {
    await asUser(BOB, () => save(ROW_B, { pick: 'bob' }))
    for (const n of [1, 2, 3, 4]) {
      await asUser(ALICE, () => save(`${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`, { n }))
    }
    expect(await asUser(BOB, () => load(ROW_B))).toEqual({ pick: 'bob' })
  })

  it('14. TTL is two hours, not a day', async () => {
    await asUser(ALICE, () => save(ROW_A, { pick: 'alice' }))
    const { rows } = await db.query(
      `SELECT EXTRACT(EPOCH FROM (expires_at - created_at))::int AS s FROM public.decision_evidence WHERE id = $1`,
      [ROW_A])
    expect(rows[0].s).toBeGreaterThan(7000)
    expect(rows[0].s).toBeLessThan(7400)
  })
})
