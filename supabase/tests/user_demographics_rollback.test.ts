import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// V3 User Data Foundation — the ROLLBACK.
//
// WHAT THIS FILE IS FOR
// `user_demographics_boundary.test.ts` proves the migration builds the right
// thing. This proves the rollback UNBUILDS it — and, just as importantly, that
// it stops there. A rollback that also removes a shared helper, or quietly
// changes `profiles`, is worse than no rollback at all: it is discovered during
// an incident, by someone who is already having a bad day.
//
// The repository convention (`supabase/migrations/rollback/`) is that a rollback
// is "a rehearsed file rather than something improvised during an incident".
// Rehearsed means executed, and this is where it gets executed.
//
// ── THE ROLLBACK FILE HAS TWO MODES, AND SO DOES THIS SUITE ──────────────────
//
// As written, the file runs sections 1 and 2 and DESTROYS NOTHING: it removes
// the functions and closes every client privilege, leaving the table and every
// date of birth in place for `service_role`. Section 3 — the `DROP TABLE` — is
// commented out and must be uncommented by hand.
//
// So `ROLLBACK` below is the file verbatim, and `ROLLBACK_FULL` is the file
// with section 3 uncommented, exactly as an operator would after reading
// VERIFY query 0. Tests that expect the table to disappear use the second one,
// and say so. Nothing here silently drops user data.
//
// ── THE PRIVILEGE ASSERTIONS ARE COLUMN-LEVEL ON PURPOSE ─────────────────────
//
// The migration grants at COLUMN level (`GRANT SELECT (user_id, gender, …)`),
// never at table level. `has_table_privilege` therefore returns false for
// `authenticated` even BEFORE anything is revoked, so a test built on it would
// pass whether or not the rollback did anything at all. These assertions use
// `has_column_privilege` / `has_any_column_privilege`, matching
// `user_demographics_boundary.test.ts` and the migration's own VERIFY block,
// and they check the state BEFORE as well as after so the transition is real.
//
// SCOPE. Local embedded PostgreSQL only. Nothing here touches production, and
// the rollback file is never run anywhere but this throwaway database.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260908_user_demographics_foundation.sql'
const ROLLBACK_PATH = 'supabase/migrations/rollback/20260908_user_demographics_foundation_rollback.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')
const ROLLBACK = readFileSync(join(REPO, ROLLBACK_PATH), 'utf8')

/**
 * Section 3, uncommented — the way an operator enables it.
 *
 * Extracted from the file rather than retyped, so this suite cannot drift from
 * the statement the file actually ships.
 */
const DESTRUCTIVE_SECTION = ROLLBACK.split('\n')
  .filter((l) => /^-- DROP TABLE IF EXISTS public\.user_demographics;$/.test(l))
  .map((l) => l.replace(/^-- /, ''))
const ROLLBACK_FULL = `${ROLLBACK}\n${DESTRUCTIVE_SECTION.join('\n')}`

/**
 * The migration's section 1 in isolation: the bare `CREATE TABLE`, before the
 * REVOKE/GRANT/RLS work in section 2. This is the dangerous intermediate state
 * the migration's own header warns about — "THIS MUST FOLLOW THE CREATE
 * IMMEDIATELY" — and it is reachable because the file carries no BEGIN/COMMIT
 * and is applied by hand.
 */
const CREATE_TABLE_ONLY = (() => {
  const start = MIGRATION.indexOf('CREATE TABLE IF NOT EXISTS public.user_demographics')
  const end = MIGRATION.indexOf('\n);', start) + '\n);'.length
  return MIGRATION.slice(start, end)
})()

const PORT = 54377
const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const FOUNDATION_FNS = [
  'user_age_status',
  'set_user_date_of_birth',
  'admin_set_user_date_of_birth',
  'age_band_of',
] as const

/**
 * The production baseline, matching `user_demographics_boundary.test.ts`.
 *
 * ONE DELIBERATE DIFFERENCE: `set_updated_at()` IS created here, unlike in the
 * boundary suite. That suite proves the migration creates it when absent; this
 * one proves the rollback does NOT remove it when it was there all along —
 * which is the production case, and the one where getting it wrong breaks
 * `profiles`.
 */
const PRELUDE = `
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

  CREATE TABLE auth.users (
    id           UUID PRIMARY KEY,
    email        VARCHAR(255),
    is_anonymous BOOLEAN NOT NULL DEFAULT false
  );

  -- The platform fact both the migration and the rollback must defend against:
  -- a new table in this schema is born fully open to anon and authenticated.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  -- Pre-existing in production, and depended on by profiles. The rollback must
  -- leave it alone.
  CREATE FUNCTION public.set_updated_at() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $body$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $body$;

  CREATE TABLE public.profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name       TEXT,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    onboarded       BOOLEAN DEFAULT false,
    follower_count  INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    language        TEXT
  );
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
  CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);
  CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid()) WITH CHECK (id = auth.uid());

  -- profiles genuinely depends on the shared helper, so a rollback that dropped
  -- it would break this trigger — and this row is what would notice.
  CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

  CREATE TABLE public.audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     UUID NOT NULL,
    actor_email  TEXT NOT NULL,
    actor_role   TEXT NOT NULL,
    action       TEXT NOT NULL,
    target_type  TEXT,
    target_id    TEXT,
    before_state JSONB,
    after_state  JSONB,
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  INSERT INTO auth.users (id, email, is_anonymous) VALUES
    ('${SELF}',  'self@example.com',  false),
    ('${OTHER}', 'other@example.com', false);

  INSERT INTO public.profiles (id, full_name) VALUES
    ('${SELF}', 'Self'), ('${OTHER}', 'Other');
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const one = async (sql: string): Promise<Record<string, unknown>> =>
  (await db.query(sql)).rows[0] as Record<string, unknown>

async function foundationFnCount(): Promise<number> {
  const r = await one(`SELECT count(*)::int AS n FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (${FOUNDATION_FNS.map((f) => `'${f}'`).join(',')})`)
  return r.n as number
}

/**
 * The COLUMN-level privilege picture. `has_table_privilege` is deliberately
 * absent: the migration never granted at table level, so it answers `false`
 * whatever the rollback did or did not do.
 */
async function columnPrivileges() {
  return await one(`SELECT
    has_any_column_privilege('authenticated','public.user_demographics','SELECT') AS auth_any_select,
    has_any_column_privilege('authenticated','public.user_demographics','UPDATE') AS auth_any_update,
    has_column_privilege('authenticated','public.user_demographics','gender','SELECT')        AS auth_gender,
    has_column_privilege('authenticated','public.user_demographics','date_of_birth','SELECT') AS auth_dob,
    has_any_column_privilege('anon','public.user_demographics','SELECT')          AS anon_any,
    has_any_column_privilege('service_role','public.user_demographics','SELECT')  AS svc_any`)
}

/** A snapshot of everything the rollback must NOT change. */
async function untouchedSnapshot() {
  return await one(`SELECT
    (SELECT count(*)::int FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles')                       AS profiles_columns,
    (SELECT count(*)::int FROM pg_policies
      WHERE schemaname='public' AND tablename='profiles')                          AS profiles_policies,
    (SELECT count(*)::int FROM information_schema.columns
      WHERE table_schema='public' AND table_name='audit_log')                      AS audit_columns,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='set_updated_at')                      AS shared_fn,
    (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relname='profiles' AND NOT t.tgisinternal)                            AS profiles_triggers`)
}

/** Everything in `public` that is NOT the Foundation. A removal here is a bug. */
async function unrelatedObjects() {
  return await one(`SELECT
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> 'user_demographics') AS tables,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname <> ALL(ARRAY[${FOUNDATION_FNS.map((f) => `'${f}'`).join(',')}])) AS functions`)
}

async function dropFoundationObjects() {
  await db.query(`DROP TABLE IF EXISTS public.user_demographics`)
  for (const f of FOUNDATION_FNS) {
    await db.query(`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
               JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='${f}'
      LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP; END $$;`)
  }
}

/** Rebuild a clean, fully migrated database. Cheaper than restarting Postgres. */
async function resetToMigrated() {
  await dropFoundationObjects()
  await db.query(MIGRATION)
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'v3-demographics-rollback-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres',
    port: PORT, persistent: false, initdbFlags: ['--locale=C'],
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('v3rollback')
  const { Client: PgClient } = await import('pg')
  db = new PgClient({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'v3rollback' })
  await db.connect()
  await db.query(PRELUDE)
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file locks */ }
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the rollback file ships the destructive path commented out', () => {
  it('section 3 is present, and is a comment', () => {
    expect(DESTRUCTIVE_SECTION).toEqual(['DROP TABLE IF EXISTS public.user_demographics;'])
  })

  it('🔑 no uncommented DROP TABLE exists in the file as shipped', () => {
    // The whole design of the file. If this fails, running the rollback deletes
    // user-entered dates of birth by default.
    const live = ROLLBACK.split('\n').filter((l) => !/^\s*--/.test(l) && /DROP TABLE/i.test(l))
    expect(live).toEqual([])
  })

  it('follows the repository convention: no CASCADE, full function signatures', () => {
    // Executable lines only. The file's own comment explains at length why it
    // does NOT use CASCADE, and matching against that prose would fail for the
    // opposite of the right reason.
    const live = ROLLBACK.split('\n').filter((l) => !/^\s*--/.test(l))
    expect(live.filter((l) => /CASCADE/i.test(l))).toEqual([])
    expect(ROLLBACK).toContain('DROP FUNCTION IF EXISTS public.admin_set_user_date_of_birth(UUID, DATE, UUID, TEXT, TEXT, TEXT);')
    expect(ROLLBACK).toContain('DROP FUNCTION IF EXISTS public.set_user_date_of_birth(DATE);')
    expect(ROLLBACK).toContain('DROP FUNCTION IF EXISTS public.user_age_status();')
    expect(ROLLBACK).toContain('DROP FUNCTION IF EXISTS public.age_band_of(DATE);')
  })
})

describe('A — the migration applies to a clean database', () => {
  beforeEach(async () => { await resetToMigrated() })

  it('creates the table, its three policies and its trigger', async () => {
    const r = await one(`SELECT
      to_regclass('public.user_demographics') IS NOT NULL AS tbl,
      (SELECT count(*)::int FROM pg_policies
        WHERE schemaname='public' AND tablename='user_demographics')      AS policies,
      (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        WHERE c.relname='user_demographics' AND NOT t.tgisinternal)       AS triggers,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_demographics'::regclass) AS rls`)
    expect(r.tbl).toBe(true)
    expect(r.policies).toBe(3)
    expect(r.triggers).toBe(1)
    expect(r.rls).toBe(true)
  })

  it('creates all four functions', async () => {
    expect(await foundationFnCount()).toBe(4)
  })

  it('🔑 grants the owner-editable columns to authenticated, and never the sensitive ones', async () => {
    // The BEFORE half of the transition the rollback has to undo. Without this,
    // every "…is now false" assertion below would be unfalsifiable.
    const p = await columnPrivileges()
    expect(p.auth_any_select).toBe(true)
    expect(p.auth_gender).toBe(true)
    expect(p.auth_dob).toBe(false)      // never granted, at any point
    expect(p.anon_any).toBe(false)
    expect(p.svc_any).toBe(true)
  })

  it('creates no rows and leaks nothing onto profiles', async () => {
    const r = await one(`SELECT
      (SELECT count(*)::int FROM public.user_demographics) AS rows_created,
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles'
          AND column_name IN ('date_of_birth','age','age_band','gender','occupation',
                              'industry','education_level','dob_corrections')) AS leaked`)
    expect(r.rows_created).toBe(0)
    expect(r.leaked).toBe(0)
  })
})

describe('B — the rollback as shipped disables the Foundation and destroys nothing', () => {
  let before: Record<string, unknown>
  let unrelatedBefore: Record<string, unknown>

  beforeEach(async () => {
    await resetToMigrated()
    // Real user data, so "destroys nothing" is a claim with something at stake.
    await db.query(`INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at, gender)
                    VALUES ('${SELF}', DATE '1994-03-15', now(), 'female')`)
    before = await untouchedSnapshot()
    unrelatedBefore = await unrelatedObjects()
  })

  it('🔑 every Foundation function existed, and then did not', async () => {
    expect(await foundationFnCount()).toBe(4)
    await db.query(ROLLBACK)
    expect(await foundationFnCount()).toBe(0)
  })

  it('🔑 the column-level grants were present, and then were gone', async () => {
    const beforeP = await columnPrivileges()
    expect(beforeP.auth_any_select).toBe(true)
    expect(beforeP.auth_gender).toBe(true)
    expect(beforeP.auth_any_update).toBe(true)

    await db.query(ROLLBACK)

    const afterP = await columnPrivileges()
    expect(afterP.auth_any_select).toBe(false)
    expect(afterP.auth_gender).toBe(false)
    expect(afterP.auth_any_update).toBe(false)
    expect(afterP.anon_any).toBe(false)
    // service_role keeps the administrative path — that is what makes the
    // preserved data reachable, and re-enabling possible.
    expect(afterP.svc_any).toBe(true)
  })

  it('removes every policy and leaves RLS enabled — denied twice over', async () => {
    await db.query(ROLLBACK)
    const r = await one(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_demographics'::regclass) AS rls,
      (SELECT count(*)::int FROM pg_policies
        WHERE schemaname='public' AND tablename='user_demographics')                        AS policies`)
    expect(r.rls).toBe(true)
    expect(r.policies).toBe(0)
  })

  it('🔑 the date of birth SURVIVES the default rollback', async () => {
    await db.query(ROLLBACK)
    const r = await one(`SELECT count(*)::int AS n FROM public.user_demographics`)
    expect(r.n).toBe(1)
    const t = await one(`SELECT to_regclass('public.user_demographics') IS NOT NULL AS tbl`)
    expect(t.tbl).toBe(true)
  })

  it('🔑 the shared set_updated_at() survived — and still fires on profiles', async () => {
    await db.query(ROLLBACK)
    const after = await untouchedSnapshot()
    expect(after.shared_fn).toBe(1)
    expect(after.profiles_triggers).toBe(before.profiles_triggers)

    await db.query(`UPDATE public.profiles SET full_name = 'Self v2' WHERE id = '${SELF}'`)
    const r = await one(`SELECT updated_at > created_at AS trigger_fired
                           FROM public.profiles WHERE id = '${SELF}'`)
    expect(r.trigger_fired).toBe(true)
  })

  it('profiles and audit_log are untouched, and no unrelated object was removed', async () => {
    await db.query(ROLLBACK)
    const after = await untouchedSnapshot()
    expect(after.profiles_columns).toBe(before.profiles_columns)
    expect(after.profiles_policies).toBe(before.profiles_policies)
    expect(after.audit_columns).toBe(before.audit_columns)
    expect(await unrelatedObjects()).toEqual(unrelatedBefore)
  })
})

describe('B2 — section 3, uncommented, is the one that removes the table', () => {
  beforeEach(async () => { await resetToMigrated() })

  it('removes the table, its trigger and every remaining grant', async () => {
    await db.query(ROLLBACK_FULL)
    const r = await one(`SELECT
      to_regclass('public.user_demographics')                              AS tbl,
      (SELECT count(*)::int FROM pg_policies
        WHERE schemaname='public' AND tablename='user_demographics')       AS policies,
      (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        WHERE c.relname='user_demographics')                               AS triggers,
      (SELECT count(*)::int FROM information_schema.column_privileges
        WHERE table_schema='public' AND table_name='user_demographics')    AS column_grants`)
    expect(r.tbl).toBeNull()
    expect(r.policies).toBe(0)
    expect(r.triggers).toBe(0)
    expect(r.column_grants).toBe(0)
  })

  it('🚨 and it DOES destroy a real date of birth — stated, not hidden', async () => {
    await db.query(`INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at)
                    VALUES ('${SELF}', DATE '1994-03-15', now())`)
    const beforeCount = await one(`SELECT count(*)::int AS n FROM public.user_demographics`)
    expect(beforeCount.n).toBe(1)

    await db.query(ROLLBACK_FULL)

    // The table is gone, and with it the only copy of that date of birth.
    const r = await one(`SELECT to_regclass('public.user_demographics') AS tbl`)
    expect(r.tbl).toBeNull()
  })

  it('still leaves profiles, audit_log and the shared helper intact', async () => {
    const before = await untouchedSnapshot()
    const unrelatedBefore = await unrelatedObjects()
    await db.query(ROLLBACK_FULL)
    const after = await untouchedSnapshot()
    expect(after).toEqual(before)
    expect(await unrelatedObjects()).toEqual(unrelatedBefore)
  })
})

describe('C — running the rollback twice is a no-op, not an error', () => {
  it('the shipped file is repeatable', async () => {
    await resetToMigrated()
    await db.query(ROLLBACK)
    await expect(db.query(ROLLBACK)).resolves.toBeDefined()
    expect(await foundationFnCount()).toBe(0)
    expect((await untouchedSnapshot()).shared_fn).toBe(1)
  })

  it('and so is the full form, after the table is already gone', async () => {
    await resetToMigrated()
    await db.query(ROLLBACK_FULL)
    await expect(db.query(ROLLBACK_FULL)).resolves.toBeDefined()
    const r = await one(`SELECT to_regclass('public.user_demographics') AS tbl`)
    expect(r.tbl).toBeNull()
  })
})

describe('D — partial migration states, because the file is applied by hand', () => {
  // The migration carries no BEGIN/COMMIT and its own header says production SQL
  // is applied section by section. So it can stop anywhere, and the rollback has
  // to cope with whatever it finds.

  it('🔑 table created, section 2 security NEVER applied — the dangerous window', async () => {
    // The state the migration's own header warns about: "THIS MUST FOLLOW THE
    // CREATE IMMEDIATELY". Between CREATE TABLE and the REVOKE, the table is
    // born fully open by ALTER DEFAULT PRIVILEGES.
    await dropFoundationObjects()
    await db.query(CREATE_TABLE_ONLY)

    // Prove we really are in the dangerous state, or the rollback below proves
    // nothing: no RLS, no policies, and anon holding the platform default.
    const open = await one(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_demographics'::regclass) AS rls,
      (SELECT count(*)::int FROM pg_policies
        WHERE schemaname='public' AND tablename='user_demographics')                        AS policies,
      has_any_column_privilege('anon','public.user_demographics','SELECT')                  AS anon_any`)
    expect(open.rls).toBe(false)
    expect(open.policies).toBe(0)
    expect(open.anon_any).toBe(true)   // wide open — exactly the hazard

    const unrelatedBefore = await unrelatedObjects()
    const before = await untouchedSnapshot()

    // The table is empty here, so VERIFY query 0 reads 0 and section 3 is the
    // correct, non-destructive choice.
    await expect(db.query(ROLLBACK_FULL)).resolves.toBeDefined()

    const r = await one(`SELECT to_regclass('public.user_demographics') AS tbl`)
    expect(r.tbl).toBeNull()
    expect(await untouchedSnapshot()).toEqual(before)
    expect(await unrelatedObjects()).toEqual(unrelatedBefore)
  })

  it('table created with full security, functions never reached', async () => {
    await resetToMigrated()
    for (const f of FOUNDATION_FNS) {
      await db.query(`DO $$ DECLARE r record; BEGIN
        FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
                 JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='${f}'
        LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP; END $$;`)
    }
    await expect(db.query(ROLLBACK_FULL)).resolves.toBeDefined()
    const r = await one(`SELECT to_regclass('public.user_demographics') AS tbl`)
    expect(r.tbl).toBeNull()
    expect((await untouchedSnapshot()).shared_fn).toBe(1)
  })

  it('🔑 functions created, table already gone — the guard that makes this safe', async () => {
    // `REVOKE ... ON TABLE` and `DROP POLICY ... ON <table>` both raise 42P01 on
    // a missing relation; neither has a table-level IF EXISTS. Section 2 is
    // wrapped in a `to_regclass` guard for exactly this state.
    await resetToMigrated()
    await db.query(`DROP TABLE public.user_demographics`)
    expect(await foundationFnCount()).toBe(4)

    await expect(db.query(ROLLBACK)).resolves.toBeDefined()

    expect(await foundationFnCount()).toBe(0)
    expect((await untouchedSnapshot()).shared_fn).toBe(1)
  })

  it('nothing applied at all — the rollback still succeeds', async () => {
    await dropFoundationObjects()
    await expect(db.query(ROLLBACK)).resolves.toBeDefined()
    await expect(db.query(ROLLBACK_FULL)).resolves.toBeDefined()
  })
})

describe('E — the data-loss guard reports what the header claims', () => {
  beforeEach(async () => { await resetToMigrated() })

  it('VERIFY query 0 reads zero on an empty table — section 3 is safe', async () => {
    const r = await one(`SELECT count(*)::int AS rows_that_would_be_destroyed
                           FROM public.user_demographics`)
    expect(r.rows_that_would_be_destroyed).toBe(0)
  })

  it('🚨 and reads non-zero once a user has answered — the STOP signal', async () => {
    await db.query(`INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at)
                    VALUES ('${SELF}', DATE '1994-03-15', now())`)
    const r = await one(`SELECT count(*)::int AS rows_that_would_be_destroyed
                           FROM public.user_demographics`)
    expect(r.rows_that_would_be_destroyed).toBe(1)
  })
})
