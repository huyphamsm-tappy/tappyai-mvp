import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Regression suite for supabase/seed/platform_owner_bootstrap.sql
//
// WHY THIS EXISTS
// The original seed shipped with `SELECT COUNT(*), MIN(user_id)`. PostgreSQL has
// no MIN() aggregate for `uuid`, so the statement could never execute — it failed
// in production with `42883: function min(uuid) does not exist`. It had passed
// code review, tsc, lint, 535 unit tests, the architecture guard and the build,
// because NONE of those execute SQL.
//
// So this suite runs a REAL PostgreSQL server (embedded-postgres downloads
// genuine PostgreSQL binaries) and executes the ACTUAL .sql files read from
// disk — never a copy pasted into the test. If the file on disk is invalid, this
// fails.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const SEED_SQL = readFileSync(join(REPO, 'supabase/seed/platform_owner_bootstrap.sql'), 'utf8')
const OWNER_MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260803_platform_owner.sql'), 'utf8')
const PHASE0_MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260713_backoffice_phase0.sql'), 'utf8')

// The harness — not any individual test — owns what "the platform" is.
//
// Supabase provides three roles, a `profiles` table, and one platform fact that
// a bare PostgreSQL does not have: default privileges that grant EXECUTE on
// every new function to `anon` and `authenticated`. Omitting that fact is what
// let F-04 ship — a suite can only be as truthful as the platform it models, and
// a test that defines its own platform can make itself green by defining one
// where it is green (ADR-019, Engineering principle).
//
// This is the minimum needed for the real migrations to apply unchanged AND for
// any privilege assertion made against them to mean something.
const SUPABASE_PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN;
    END IF;
  END $$;

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- Must be re-applied on every beforeEach, not once at startup: default ACLs
  -- are recorded per SCHEMA OID, and \`DROP SCHEMA public CASCADE\` takes them
  -- with it. Measured: pg_default_acl rows=1 before the drop, rows=0 after.
  -- A function created while it is absent gets proacl = NULL, which means
  -- PostgreSQL's built-in default — under which PUBLIC, and therefore every
  -- role, holds EXECUTE. That looks the same as "anon can call it" and is not.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE IF NOT EXISTS profiles (
    id    UUID PRIMARY KEY,
    email TEXT
  );
`

const U1 = '11111111-1111-1111-1111-111111111111'
const U2 = '22222222-2222-2222-2222-222222222222'
const U3 = '33333333-3333-3333-3333-333333333333'

let pgServer: EmbeddedPostgres
let db: Client
let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgtest-'))
  pgServer = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: 54329,
    persistent: false,
    // Supabase runs UTF8. Without this, initdb inherits the host's Windows
    // locale and creates a WIN1252 cluster, which rejects the em-dashes in our
    // own migration comments — a failure that says nothing about the SQL.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })
  await pgServer.initialise()
  await pgServer.start()
  await pgServer.createDatabase('controller_test')
  db = pgServer.getPgClient('controller_test')
  await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pgServer?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

/** Rebuild the schema from the REAL migration files before every test. */
beforeEach(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(SUPABASE_PRELUDE)
  await db.query(PHASE0_MIGRATION)
  await db.query(OWNER_MIGRATION)
  await db.query(
    `INSERT INTO profiles (id, email) VALUES ($1,'a@b.c'), ($2,'c@d.e'), ($3,'e@f.g')`,
    [U1, U2, U3]
  )
})

async function grantSuperAdmin(userId: string, expiresAt: string | null = null) {
  await db.query(
    `INSERT INTO admin_roles (user_id, role, expires_at) VALUES ($1,'super_admin',$2)`,
    [userId, expiresAt]
  )
}

const runBootstrap = () => db.query(SEED_SQL)

describe('harness — the platform this suite models', () => {
  it('reproduces Supabase default privileges on functions', async () => {
    // Guards the guard. If this fails, every privilege assertion made anywhere
    // in this suite is vacuous rather than merely wrong, because the `anon` it
    // tested against would be a bare role this file invented.
    //
    // The instrument is `proacl`, NOT has_function_privilege. Default privileges
    // MATERIALISE as explicit ACL entries at CREATE time; a function created
    // without them in force has proacl = NULL, which means PostgreSQL's built-in
    // default — under which PUBLIC holds EXECUTE and every role is a member of
    // PUBLIC. has_function_privilege('anon', ...) therefore returns true in BOTH
    // cases and cannot tell them apart. Measured, on the un-revoked canary.
    //
    // `fn_is_platform_owner` is the canary because 20260803_platform_owner.sql
    // creates it and never revokes it — it grants service_role only. Production
    // measures its ACL with an explicit `anon=X/postgres` entry, which is
    // exactly what proves the platform grant was live when the migration ran.
    const { rows } = await db.query(
      `SELECT COALESCE(array_to_string(p.proacl, ' '), '<null: built-in default>') AS acl
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'fn_is_platform_owner'`
    )

    expect(rows, 'fn_is_platform_owner must exist').toHaveLength(1)
    const acl: string = rows[0].acl
    expect(
      acl,
      'the un-revoked Component 1 function must carry an EXPLICIT anon grant — if it ' +
        'does not, Supabase default privileges were NOT in force when the migration ' +
        'created its functions, and this suite is testing a platform that does not exist',
    ).toContain('anon=X')
    expect(acl, 'and an explicit authenticated grant, for the same reason').toContain('authenticated=X')
  })
})

describe('platform_owner_bootstrap.sql — against a real PostgreSQL', () => {
  it('REGRESSION: the seed is valid SQL and executes (guards against MIN(uuid))', async () => {
    await grantSuperAdmin(U1)
    // Before the fix this threw: 42883 function min(uuid) does not exist
    await expect(runBootstrap()).resolves.toBeDefined()
  })

  it('exactly one active super_admin → assigns that user as Owner', async () => {
    await grantSuperAdmin(U1)
    await runBootstrap()

    const { rows } = await db.query(
      `SELECT user_id, active, assigned_by, notes FROM platform_owner`
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(U1)
    expect(rows[0].active).toBe(true)
    expect(rows[0].assigned_by).toBe('bootstrap')
  })

  it('zero active super_admin → aborts and writes nothing', async () => {
    await expect(runBootstrap()).rejects.toThrow(/BOOTSTRAP ABORTED: expected exactly 1 active super_admin, found 0/)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM platform_owner')
    expect(rows[0].n).toBe(0)
  })

  it('two active super_admins → aborts and writes nothing', async () => {
    await grantSuperAdmin(U1)
    await grantSuperAdmin(U2)
    await expect(runBootstrap()).rejects.toThrow(/BOOTSTRAP ABORTED: expected exactly 1 active super_admin, found 2/)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM platform_owner')
    expect(rows[0].n).toBe(0)
  })

  it('second execution is idempotent — no error, no second owner, row unchanged', async () => {
    await grantSuperAdmin(U1)
    await runBootstrap()
    const first = await db.query('SELECT id, user_id, assigned_at FROM platform_owner')

    await expect(runBootstrap()).resolves.toBeDefined()

    const second = await db.query('SELECT id, user_id, assigned_at FROM platform_owner')
    expect(second.rows).toHaveLength(1)
    expect(second.rows[0].id).toBe(first.rows[0].id)
    expect(second.rows[0].assigned_at).toEqual(first.rows[0].assigned_at)
  })

  // Business rule preserved from the original: expiry is honoured, so an expired
  // grant must not be counted as an active super_admin.
  it('expired super_admin does not count — aborts as "found 0"', async () => {
    await grantSuperAdmin(U1, '2000-01-01T00:00:00Z')
    await expect(runBootstrap()).rejects.toThrow(/found 0/)
  })

  it('one active + one expired → the ACTIVE user becomes Owner', async () => {
    await grantSuperAdmin(U1, '2000-01-01T00:00:00Z')
    await grantSuperAdmin(U2)
    await runBootstrap()

    const { rows } = await db.query('SELECT user_id FROM platform_owner WHERE active = true')
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(U2)
  })
})

describe('platform_owner invariants — against a real PostgreSQL', () => {
  it('the partial unique index permits at most ONE active owner', async () => {
    await grantSuperAdmin(U1)
    await runBootstrap()
    await expect(
      db.query(`INSERT INTO platform_owner (user_id, assigned_by) VALUES ($1,'manual')`, [U2])
    ).rejects.toThrow(/duplicate key value violates unique constraint "uq_platform_owner_single_active"/)
  })

  it('a revoked owner frees the slot for a new active owner', async () => {
    await grantSuperAdmin(U1)
    await runBootstrap()
    await db.query(`UPDATE platform_owner SET active = false, revoked_at = NOW() WHERE active = true`)
    await expect(
      db.query(`INSERT INTO platform_owner (user_id, assigned_by) VALUES ($1,'break_glass')`, [U2])
    ).resolves.toBeDefined()
  })

  it('deleting the Owner profile is blocked by ON DELETE RESTRICT', async () => {
    await grantSuperAdmin(U1)
    await runBootstrap()
    await expect(db.query('DELETE FROM profiles WHERE id = $1', [U1]))
      .rejects.toThrow(/violates foreign key constraint/)
  })
})
