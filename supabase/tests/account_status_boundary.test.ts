import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Controller V2 — Phase 2 / Module 08: the `account_status` security boundary.
//
// Owner authorization 2026-08-19 (Candidate C): the four account-status fields
// MUST leave `public.profiles`. `profiles` is a public-read, self-write table —
// two permissive SELECT policies with `qual = true` for `{public}`, and table
// grants giving `anon` and `authenticated` SELECT/INSERT/UPDATE/DELETE. RLS
// filters rows, never columns, so a suspension flag stored there would be
// readable by the anonymous internet and clearable by the suspended user.
//
// WHY THE PRELUDE GRANTS EVERYTHING FIRST
// Production `pg_default_acl` for tables reads
//   `anon=arwdDxtm/postgres  authenticated=arwdDxtm/postgres`
// so a new table is born fully open. Without the ALTER DEFAULT PRIVILEGES lines
// below, every REVOKE assertion in this file would pass vacuously — the ACL
// would be empty because nothing ever granted anything, not because the
// migration took it away. `harness_control` is created under the same defaults
// and never revoked: its ACL is the proof the defaults were in force at CREATE
// time, which is what makes `account_status`'s closed ACL meaningful. This is
// ADR-019's rule — platform facts belong in the harness, not inside a test.
//
// SCOPE. This file asserts the DATABASE boundary only: grants, RLS
// configuration, policy shape, and the behaviour of each role against it.
// Consumer enforcement (cannot post / comment / use AI) and ban-time session
// revocation are Auth Admin API and application concerns, deliberately out of
// scope — a column does not revoke a session.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260819_m08_account_status.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

const PORT = 54354
const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
/** Has a profile and deliberately NO account_status row — the ACTIVE default. */
const NOSTATUS = '44444444-4444-4444-8444-444444444444'

/**
 * The production baseline this migration lands on.
 *
 * `profiles` is reproduced with the exact 10 columns production carries on
 * 2026-08-19, including the two permissive `qual = true` SELECT policies, so
 * "the migration did not touch profiles" is asserted against the real shape.
 * `set_updated_at` is copied from production's `pg_get_functiondef` output —
 * the migration reuses it rather than defining its own.
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

  -- The platform fact the migration must defend against.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;

  CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $fn$;

  CREATE TABLE public.profiles (
    id              UUID PRIMARY KEY,
    username        TEXT UNIQUE,
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

  -- Control object: same defaults, never revoked.
  CREATE TABLE public.harness_control (id INT PRIMARY KEY);

  INSERT INTO public.profiles (id, full_name) VALUES
    ('${SELF}', 'Self'), ('${OTHER}', 'Other'), ('${NOSTATUS}', 'Never moderated');
`

const SEED = `
  INSERT INTO public.account_status (user_id, is_suspended, suspended_until, is_banned, ban_reason) VALUES
    ('${SELF}',  true,  '2026-09-01T00:00:00Z', false, 'internal moderator note — self'),
    ('${OTHER}', false, NULL,                   true,  'internal moderator note — other');
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Runs `sql` as `role` with an optional session subject. Returns the SQLSTATE, or null on success. */
async function asRole(role: string, sql: string, sub: string | null = null): Promise<string | null> {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? ''])
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

/** Reads rows as `role`. Throws if the role cannot run the statement at all. */
async function rowsAsRole(role: string, sql: string, sub: string | null = null) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? ''])
  try {
    await db.query(`SET ROLE ${role}`)
    return (await db.query(sql)).rows
  } finally {
    await db.query('RESET ROLE')
  }
}

const one = async (sql: string) => (await db.query(sql)).rows[0]

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'm08-account-status-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres',
    port: PORT, persistent: false,
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('m08')
  db = pg.getPgClient() as unknown as Client
  // getPgClient targets the default database; connect to the fresh one.
  const { Client: PgClient } = await import('pg')
  db = new PgClient({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'm08' })
  await db.connect()

  await db.query(PRELUDE)
  await db.query(MIGRATION)
  await db.query(SEED)
}, 180_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file locks */ }
})

describe('harness integrity — the platform defaults were in force', () => {
  it('the control object carries the default grants, so a closed ACL means something', async () => {
    const r = await one(`SELECT
      has_table_privilege('anon','public.harness_control','SELECT')          AS anon_sel,
      has_table_privilege('authenticated','public.harness_control','UPDATE') AS auth_upd`)
    expect(r.anon_sel).toBe(true)
    expect(r.auth_upd).toBe(true)
  })
})

describe('anon is closed completely', () => {
  it('holds no table privilege of any kind', async () => {
    const r = await one(`SELECT
      has_table_privilege('anon','public.account_status','SELECT') AS s,
      has_table_privilege('anon','public.account_status','INSERT') AS i,
      has_table_privilege('anon','public.account_status','UPDATE') AS u,
      has_table_privilege('anon','public.account_status','DELETE') AS d`)
    expect([r.s, r.i, r.u, r.d]).toEqual([false, false, false, false])
  })

  it('holds no privilege on ANY column, including the non-sensitive ones', async () => {
    const r = await one(`SELECT
      has_any_column_privilege('anon','public.account_status','SELECT') AS any_sel,
      has_column_privilege('anon','public.account_status','is_suspended','SELECT') AS is_susp,
      has_column_privilege('anon','public.account_status','ban_reason','SELECT')   AS reason`)
    expect(r.any_sel).toBe(false)
    expect(r.is_susp).toBe(false)
    expect(r.reason).toBe(false)
  })

  it('is denied at runtime, not merely by catalogue', async () => {
    expect(await asRole('anon', `SELECT is_suspended FROM public.account_status`)).toBe('42501')
    expect(await asRole('anon', `SELECT ban_reason FROM public.account_status`)).toBe('42501')
    expect(await asRole('anon', `SELECT * FROM public.account_status`)).toBe('42501')
  })
})

describe('authenticated may read exactly four columns, never ban_reason', () => {
  it('has no whole-table SELECT — the grant is a column list', async () => {
    const r = await one(`SELECT has_table_privilege('authenticated','public.account_status','SELECT') AS s`)
    expect(r.s).toBe(false)
  })

  it('holds SELECT on the four authorized columns', async () => {
    for (const col of ['user_id', 'is_suspended', 'suspended_until', 'is_banned']) {
      const r = await one(
        `SELECT has_column_privilege('authenticated','public.account_status','${col}','SELECT') AS g`
      )
      expect(r.g, `expected authenticated to read ${col}`).toBe(true)
    }
  })

  it('does NOT hold SELECT on ban_reason', async () => {
    const r = await one(
      `SELECT has_column_privilege('authenticated','public.account_status','ban_reason','SELECT') AS g`
    )
    expect(r.g).toBe(false)
  })

  it('cannot read ban_reason at runtime, directly or via SELECT *', async () => {
    expect(await asRole('authenticated', `SELECT ban_reason FROM public.account_status`, SELF)).toBe('42501')
    expect(await asRole('authenticated', `SELECT * FROM public.account_status`, SELF)).toBe('42501')
  })

  it('reads its OWN row through the policy', async () => {
    const rows = await rowsAsRole(
      'authenticated',
      `SELECT user_id, is_suspended, suspended_until, is_banned FROM public.account_status`,
      SELF
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(SELF)
    expect(rows[0].is_suspended).toBe(true)
  })

  it('cannot see another user’s row', async () => {
    const rows = await rowsAsRole(
      'authenticated',
      `SELECT user_id FROM public.account_status WHERE user_id = '${OTHER}'`,
      SELF
    )
    expect(rows).toHaveLength(0)
  })
})

describe('Owner Decision 2 — suspension is not self-clearable', () => {
  it('authenticated holds no write privilege', async () => {
    const r = await one(`SELECT
      has_table_privilege('authenticated','public.account_status','INSERT') AS i,
      has_table_privilege('authenticated','public.account_status','UPDATE') AS u,
      has_table_privilege('authenticated','public.account_status','DELETE') AS d,
      has_any_column_privilege('authenticated','public.account_status','UPDATE') AS any_upd`)
    expect([r.i, r.u, r.d, r.any_upd]).toEqual([false, false, false, false])
  })

  it('a suspended user cannot clear their own suspension', async () => {
    expect(await asRole(
      'authenticated',
      `UPDATE public.account_status SET is_suspended = false, is_banned = false WHERE user_id = '${SELF}'`,
      SELF
    )).toBe('42501')

    const [row] = await rowsAsRole(
      'authenticated', `SELECT is_suspended FROM public.account_status`, SELF
    )
    expect(row.is_suspended).toBe(true)
  })

  it('cannot insert a clean row for itself, nor delete the suspending one', async () => {
    expect(await asRole(
      'authenticated',
      `INSERT INTO public.account_status (user_id) VALUES ('${SELF}')`, SELF
    )).toBe('42501')
    expect(await asRole(
      'authenticated',
      `DELETE FROM public.account_status WHERE user_id = '${SELF}'`, SELF
    )).toBe('42501')
  })
})

describe('RLS configuration', () => {
  it('is enabled', async () => {
    const r = await one(`SELECT relrowsecurity AS on FROM pg_class WHERE oid='public.account_status'::regclass`)
    expect(r.on).toBe(true)
  })

  it('carries exactly one policy: SELECT, for authenticated, own-row', async () => {
    const rows = (await db.query(
      `SELECT policyname, cmd, roles::text, qual, permissive
         FROM pg_policies WHERE schemaname='public' AND tablename='account_status'`
    )).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].cmd).toBe('SELECT')
    expect(rows[0].roles).toBe('{authenticated}')
    expect(rows[0].qual).toContain('auth.uid()')
  })

  it('has no INSERT, UPDATE or DELETE policy', async () => {
    const rows = (await db.query(
      `SELECT cmd FROM pg_policies
        WHERE schemaname='public' AND tablename='account_status'
          AND cmd IN ('INSERT','UPDATE','DELETE','ALL')`
    )).rows
    expect(rows).toHaveLength(0)
  })
})

describe('service_role remains the administrative write path', () => {
  it('reads every column of every row, ban_reason included', async () => {
    const rows = await rowsAsRole('service_role', `SELECT user_id, ban_reason FROM public.account_status`)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.ban_reason).filter(Boolean)).toHaveLength(2)
  })

  it('writes suspension state', async () => {
    expect(await asRole(
      'service_role',
      `UPDATE public.account_status SET is_suspended = false WHERE user_id = '${SELF}'`
    )).toBeNull()
    // restore, so ordering between tests cannot mask a later assertion
    await db.query(`UPDATE public.account_status SET is_suspended = true WHERE user_id = '${SELF}'`)
  })
})

describe('schema shape', () => {
  it('user_id is the primary key and cascades from profiles', async () => {
    const r = await one(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
       WHERE c.conrelid='public.account_status'::regclass AND c.contype='f'`)
    expect(r.def).toContain('REFERENCES profiles(id)')
    expect(r.def).toContain('ON DELETE CASCADE')

    await db.query(`INSERT INTO public.profiles (id, full_name) VALUES ('33333333-3333-4333-8333-333333333333','Temp')`)
    await db.query(`INSERT INTO public.account_status (user_id) VALUES ('33333333-3333-4333-8333-333333333333')`)
    await db.query(`DELETE FROM public.profiles WHERE id='33333333-3333-4333-8333-333333333333'`)
    const left = await one(`SELECT count(*)::int AS n FROM public.account_status WHERE user_id='33333333-3333-4333-8333-333333333333'`)
    expect(left.n).toBe(0)
  })

  it('booleans are NOT NULL DEFAULT false, so a bare insert means ACTIVE', async () => {
    const rows = (await db.query(`
      SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='account_status'
         AND column_name IN ('is_suspended','is_banned')
       ORDER BY column_name`)).rows
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.is_nullable).toBe('NO')
      expect(r.column_default).toBe('false')
    }
  })

  it('carries a partial index for the expiry job', async () => {
    const r = await one(`
      SELECT string_agg(indexdef, ' | ') AS defs
        FROM pg_indexes WHERE schemaname='public' AND tablename='account_status'`)
    expect(r.defs).toContain('suspended_until')
    expect(r.defs).toMatch(/WHERE .*is_suspended/)
  })

  it('updated_at is maintained by the existing set_updated_at trigger', async () => {
    const t = await one(`
      SELECT p.proname AS fn
        FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
       WHERE tg.tgrelid='public.account_status'::regclass AND NOT tg.tgisinternal`)
    expect(t.fn).toBe('set_updated_at')

    await db.query(`UPDATE public.account_status SET updated_at = '2020-01-01T00:00:00Z' WHERE user_id='${OTHER}'`)
    await db.query(`UPDATE public.account_status SET is_banned = true WHERE user_id='${OTHER}'`)
    const r = await one(`SELECT updated_at > '2021-01-01T00:00:00Z' AS bumped FROM public.account_status WHERE user_id='${OTHER}'`)
    expect(r.bumped).toBe(true)
  })

  it('absent row means ACTIVE — nothing is backfilled and no signup trigger exists', async () => {
    // A profile exists with no status row at all: no backfill ran, and creating
    // a profile did not create one either.
    const gap = await one(`
      SELECT (SELECT count(*)::int FROM public.profiles)       AS profiles,
             (SELECT count(*)::int FROM public.account_status) AS statuses,
             EXISTS (SELECT 1 FROM public.account_status WHERE user_id = '${NOSTATUS}') AS has_row`)
    expect(gap.has_row).toBe(false)
    expect(gap.statuses).toBeLessThan(gap.profiles)

    const triggers = await one(`
      SELECT count(*)::int AS n FROM pg_trigger
       WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal`)
    expect(triggers.n).toBe(0)

    // The enforcement shape the consumer side must use — asserted on the user
    // who has NO row, which is the only case COALESCE actually decides.
    const j = await one(`
      SELECT COALESCE(s.is_suspended, false) AS suspended,
             COALESCE(s.is_banned, false)    AS banned
        FROM public.profiles p
        LEFT JOIN public.account_status s ON s.user_id = p.id
       WHERE p.id = '${NOSTATUS}'`)
    expect(j.suspended).toBe(false)
    expect(j.banned).toBe(false)

    // An inner join would silently drop this user; that is the mistake the
    // absent-row semantics invite, so it is pinned here.
    const inner = await one(`
      SELECT count(*)::int AS n
        FROM public.profiles p
        JOIN public.account_status s ON s.user_id = p.id
       WHERE p.id = '${NOSTATUS}'`)
    expect(inner.n).toBe(0)
  })
})

describe('public.profiles is not altered by this migration', () => {
  it('none of the four fields landed on profiles', async () => {
    const rows = (await db.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='profiles'
         AND column_name IN ('is_suspended','suspended_until','is_banned','ban_reason')`)).rows
    expect(rows).toHaveLength(0)
  })

  it('profiles keeps its grants and its policies untouched', async () => {
    const r = await one(`SELECT
      has_table_privilege('anon','public.profiles','SELECT')          AS anon_sel,
      has_table_privilege('authenticated','public.profiles','UPDATE') AS auth_upd,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='profiles') AS policies`)
    expect(r.anon_sel).toBe(true)
    expect(r.auth_upd).toBe(true)
    expect(r.policies).toBe(3)
  })

  it('the migration text names no ALTER TABLE on profiles', () => {
    expect(MIGRATION).not.toMatch(/ALTER\s+TABLE\s+(public\.)?profiles/i)
  })
})

describe('the migration declares its grants explicitly (ADR-019 principle)', () => {
  it('names anon and authenticated in a REVOKE rather than relying on silence', () => {
    expect(MIGRATION).toMatch(/REVOKE\s+ALL[\s\S]*?FROM[\s\S]*?anon[\s\S]*?authenticated/i)
  })

  it('grants authenticated a column list that excludes ban_reason', () => {
    const grant = /GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+(?:TABLE\s+)?public\.account_status\s+TO\s+authenticated/i.exec(MIGRATION)
    expect(grant, 'expected a column-list GRANT for authenticated').not.toBeNull()
    expect(grant![1]).not.toMatch(/ban_reason/i)
    expect(grant![1]).toMatch(/is_suspended/i)
  })
})
