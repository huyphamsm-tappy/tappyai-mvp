import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// fn_sync_last_login was callable by `anon` — the same defect as BL-C7-01, in a
// different migration. 20260713_auth_daily_rollup.sql creates the function and
// contains ZERO GRANT/REVOKE statements, so the exposure comes entirely from
// Supabase's project-wide ALTER DEFAULT PRIVILEGES plus PostgreSQL's PUBLIC
// default.
//
// Runs the ACTUAL .sql files from disk against a REAL PostgreSQL and proves it
// both ways:
//
//   RED   before 20260807b_sync_last_login_revoke_public_execute.sql, `anon`
//         can execute the function AND its write lands — despite RLS being
//         enabled on the target table, because SECURITY DEFINER bypasses RLS.
//   GREEN after it, `anon` and `authenticated` get 42501, and service_role
//         still works.
//
// The prelude is copied from the corrected harness (audit_chain.test.ts /
// platform_owner_revoke.test.ts), NOT from platform_owner_bootstrap.test.ts —
// that one creates only `service_role` and never applies Supabase's default
// privileges, so it is green against a platform on which this bug cannot exist.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const ROLLUP = readFileSync(join(REPO, 'supabase/migrations/20260713_auth_daily_rollup.sql'), 'utf8')
const REVOKE_FIX = readFileSync(
  join(REPO, 'supabase/migrations/20260807b_sync_last_login_revoke_public_execute.sql'),
  'utf8',
)

// Prerequisites 20260713_auth_daily_rollup.sql expects to already exist. It
// creates only auth_daily_rollup; auth.users, user_acquisition and user_events
// come from earlier migrations. These are the minimal shapes its two functions
// reference — `LANGUAGE sql` bodies are validated at CREATE time, so they must
// be present and correctly shaped or the migration itself fails to apply.
const PRELUDE = `
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

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- The platform fact the whole finding turns on: Supabase configures this on
  -- every project, so a function created afterwards carries EXPLICIT anon and
  -- authenticated grants on top of PostgreSQL's PUBLIC default. Re-applied on
  -- every beforeEach because DROP SCHEMA public CASCADE also drops its
  -- pg_default_acl entries.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE IF NOT EXISTS auth.users (
    id              UUID PRIMARY KEY,
    last_sign_in_at TIMESTAMPTZ
  );

  CREATE TABLE public.user_acquisition (
    user_id       UUID PRIMARY KEY,
    last_login_at TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- Enabled with no policy for anon: proves the RED case bypasses RLS rather
  -- than simply being allowed by it.
  ALTER TABLE public.user_acquisition ENABLE ROW LEVEL SECURITY;

  CREATE TABLE public.user_events (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID,
    event_type TEXT,
    platform   TEXT,
    metadata   JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`

const USER_ID = '11111111-1111-1111-1111-111111111111'
const SIGNED_IN_AT = '2026-08-07T10:00:00Z'
const PORT = 54338

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Runs `sql` as `role` and returns the PostgreSQL error code, or null on success. */
async function asRole(role: string, sql: string): Promise<string | null> {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('RESET ROLE')
  }
}

/** last_login_at currently stored for the seeded user, read as the superuser. */
async function storedLastLogin(): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT last_login_at FROM public.user_acquisition WHERE user_id = $1`,
    [USER_ID],
  )
  return rows[0]?.last_login_at ?? null
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgsynclogin-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
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
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(ROLLUP)
  await db.query(`INSERT INTO auth.users (id, last_sign_in_at) VALUES ($1, $2)`, [USER_ID, SIGNED_IN_AT])
  // last_login_at deliberately stale, so a successful sync is observable.
  await db.query(`INSERT INTO public.user_acquisition (user_id, last_login_at) VALUES ($1, NULL)`, [USER_ID])
})

describe('fn_sync_last_login — RED: before the revoke migration', () => {
  it('the migration that creates it contains no GRANT or REVOKE at all', () => {
    // The root cause: the exposure is inherited from platform defaults, never
    // written down. If this ever stops being true, re-derive the fix.
    expect(ROLLUP).not.toMatch(/^\s*(GRANT|REVOKE)\b/im)
  })

  it('anon can execute it', async () => {
    expect(await asRole('anon', 'SELECT public.fn_sync_last_login()')).toBeNull()
  })

  it("anon's call actually writes — SECURITY DEFINER bypasses RLS", async () => {
    expect(await storedLastLogin()).toBeNull()
    await asRole('anon', 'SELECT public.fn_sync_last_login()')
    const after = await storedLastLogin()
    expect(after).not.toBeNull()
    expect(new Date(after as string).toISOString()).toBe(new Date(SIGNED_IN_AT).toISOString())
  })

  it('anon has no direct write access to the table — so the write above came only via the function', async () => {
    expect(
      await asRole('anon', `UPDATE public.user_acquisition SET last_login_at = now()`),
    ).toBe('42501')
  })
})

describe('fn_sync_last_login — GREEN: after the revoke migration', () => {
  beforeEach(async () => {
    await db.query(REVOKE_FIX)
  })

  it('anon is denied with 42501 permission denied', async () => {
    expect(await asRole('anon', 'SELECT public.fn_sync_last_login()')).toBe('42501')
  })

  it('authenticated is denied too — REVOKE FROM PUBLIC alone would have missed it', async () => {
    expect(await asRole('authenticated', 'SELECT public.fn_sync_last_login()')).toBe('42501')
  })

  it('the anon write no longer happens', async () => {
    await asRole('anon', 'SELECT public.fn_sync_last_login()')
    expect(await storedLastLogin()).toBeNull()
  })

  it('service_role still works — the analytics cron path is intact', async () => {
    // This is the assertion that justifies shipping REVOKE with no GRANT:
    // service_role holds its own ACL entry, independent of PUBLIC.
    expect(await asRole('service_role', 'SELECT public.fn_sync_last_login()')).toBeNull()
    const after = await storedLastLogin()
    expect(new Date(after as string).toISOString()).toBe(new Date(SIGNED_IN_AT).toISOString())
  })

  it('no anon / authenticated / PUBLIC grant survives in the ACL', async () => {
    const { rows } = await db.query(`
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                  ELSE a.grantee::regrole::text END AS grantee
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE n.nspname = 'public' AND p.proname = 'fn_sync_last_login'
        AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon','authenticated'))
    `)
    expect(rows).toEqual([])
  })

  it('service_role IS still present in the ACL', async () => {
    const { rows } = await db.query(`
      SELECT a.grantee::regrole::text AS grantee
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE n.nspname = 'public' AND p.proname = 'fn_sync_last_login'
        AND a.grantee::regrole::text = 'service_role'
    `)
    expect(rows).toHaveLength(1)
  })

  it('is idempotent — re-applying changes nothing', async () => {
    await db.query(REVOKE_FIX)
    expect(await asRole('anon', 'SELECT public.fn_sync_last_login()')).toBe('42501')
    expect(await asRole('service_role', 'SELECT public.fn_sync_last_login()')).toBeNull()
  })
})
