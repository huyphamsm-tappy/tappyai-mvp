import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// V3 User Data Foundation — the `public.user_demographics` security boundary.
//
// WHAT THIS FILE IS FOR
// The requirement was "store date of birth in the canonical profile, and protect
// it strictly". On this database those two halves cannot both hold for
// `public.profiles`: it carries two permissive SELECT policies with
// `qual = true` for `{public}` and table grants giving `anon` and
// `authenticated` full CRUD, and RLS filters ROWS, never COLUMNS. A
// `date_of_birth` column there would be readable by the anonymous internet and
// WRITABLE BY ITS OWN SUBJECT — which would make the 18+ gate advisory, since
// the blocked user could simply PATCH their way past it.
//
// This suite asserts that the isolated table actually closes both doors, and it
// does so against a PRELUDE that reproduces the open production baseline. That
// ordering matters: see the harness-integrity block.
//
// WHY THE PRELUDE GRANTS EVERYTHING FIRST
// Production `pg_default_acl` for tables in schema public reads
//   anon=arwdDxtm/postgres  authenticated=arwdDxtm/postgres
// so a new table is born fully open. Without ALTER DEFAULT PRIVILEGES below,
// every REVOKE assertion here would pass VACUOUSLY — the ACL would be empty
// because nothing ever granted anything, not because the migration took it
// away. `harness_control` is created under the same defaults and never revoked;
// its ACL is the proof the defaults were in force at CREATE time.
//
// SCOPE. The DATABASE boundary only: grants, RLS, policy shape, function ACLs
// and the behaviour of each role against them, plus the two SECURITY DEFINER
// functions' own rules. Application enforcement (which routes refuse an
// ineligible caller) is asserted in `src/lib/account/*.test.ts` — a column does
// not refuse an HTTP request.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260908_user_demographics_foundation.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

const PORT = 54375
const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
/** Has a profile and deliberately NO demographic row — the never-asked default. */
const NOROW = '33333333-3333-4333-8333-333333333333'
/** An anonymous identity: exists in auth.users, has NO profiles row (20260808c). */
const ANON_USER = '44444444-4444-4444-8444-444444444444'

/**
 * The production baseline this migration lands on.
 *
 * `profiles` is reproduced with its real open policies so "the migration did not
 * touch profiles, and did not inherit its openness" is asserted against the
 * actual shape rather than a convenient one.
 *
 * `set_updated_at` is deliberately NOT created here: the migration's section 0
 * must create it when absent, and this is the case that proves it does.
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

  -- auth.users carries is_anonymous in this project — measured, see
  -- anonymous_profile_guard.test.ts.
  CREATE TABLE auth.users (
    id           UUID PRIMARY KEY,
    email        VARCHAR(255),
    is_anonymous BOOLEAN NOT NULL DEFAULT false
  );

  -- The platform fact the migration must defend against.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

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

  -- Controller V2's audit sink. Reproduced without the Component 7 chain
  -- trigger: this suite asserts that the admin path WRITES a correct row, not
  -- that the chain links it — that is audit_chain.test.ts's subject, and the
  -- trigger is documented as computing seq/hashes for any plain INSERT.
  -- (No backticks in this block: it lives inside a JS template literal.)
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

  -- Control object: same defaults, never revoked.
  CREATE TABLE public.harness_control (id INT PRIMARY KEY);
  -- Control function: same default EXECUTE grant, never revoked.
  CREATE FUNCTION public.harness_control_fn() RETURNS int LANGUAGE sql AS $fn$ SELECT 1 $fn$;

  INSERT INTO auth.users (id, email, is_anonymous) VALUES
    ('${SELF}',      'self@example.com',  false),
    ('${OTHER}',     'other@example.com', false),
    ('${NOROW}',     'norow@example.com', false),
    ('${ANON_USER}', NULL,                true);

  INSERT INTO public.profiles (id, full_name) VALUES
    ('${SELF}', 'Self'), ('${OTHER}', 'Other'), ('${NOROW}', 'Never asked');
`

/** Seeded by service_role (BYPASSRLS), the way the admin path would. */
const SEED = `
  INSERT INTO public.user_demographics
    (user_id, date_of_birth, age_declared_at, gender, city, country, occupation)
  VALUES
    ('${SELF}',  DATE '1994-03-15', now(), 'female', 'Ho Chi Minh City', 'VN', 'Designer'),
    ('${OTHER}', DATE '1988-11-02', now(), 'male',   'Hanoi',            'VN', 'Engineer');
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
  dataDir = mkdtempSync(join(tmpdir(), 'v3-user-demographics-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres',
    port: PORT, persistent: false, initdbFlags: ['--locale=C'],
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('v3demo')
  const { Client: PgClient } = await import('pg')
  db = new PgClient({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'v3demo' })
  await db.connect()

  await db.query(PRELUDE)
  await db.query(MIGRATION)
  await db.query(SEED)
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file locks */ }
})

// ─────────────────────────────────────────────────────────────────────────────

describe('harness integrity — the platform defaults were in force', () => {
  it('the control table carries the default grants, so a closed ACL means something', async () => {
    const r = await one(`SELECT
      has_table_privilege('anon','public.harness_control','SELECT')          AS anon_sel,
      has_table_privilege('authenticated','public.harness_control','UPDATE') AS auth_upd`)
    expect(r.anon_sel).toBe(true)
    expect(r.auth_upd).toBe(true)
  })

  it('the control function carries the default EXECUTE grant (ADR-019 platform fact)', async () => {
    const r = await one(`SELECT
      has_function_privilege('anon','public.harness_control_fn()','EXECUTE') AS anon_exec`)
    // If this is false the ALTER DEFAULT PRIVILEGES for FUNCTIONS did not apply, and every
    // function-ACL assertion below would be vacuous.
    expect(r.anon_exec).toBe(true)
  })

  it('creates set_updated_at when the database lacks it', async () => {
    // The PRELUDE deliberately does not define it; section 0 of the migration must.
    const r = await one(`SELECT count(*)::int AS n FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='set_updated_at'`)
    expect(r.n).toBe(1)
  })
})

describe('anon is closed completely', () => {
  it('holds no table privilege of any kind', async () => {
    const r = await one(`SELECT
      has_table_privilege('anon','public.user_demographics','SELECT') AS s,
      has_table_privilege('anon','public.user_demographics','INSERT') AS i,
      has_table_privilege('anon','public.user_demographics','UPDATE') AS u,
      has_table_privilege('anon','public.user_demographics','DELETE') AS d`)
    expect([r.s, r.i, r.u, r.d]).toEqual([false, false, false, false])
  })

  it('holds no privilege on ANY column', async () => {
    const r = await one(`SELECT
      has_any_column_privilege('anon','public.user_demographics','SELECT') AS any_sel,
      has_column_privilege('anon','public.user_demographics','city','SELECT')          AS city,
      has_column_privilege('anon','public.user_demographics','date_of_birth','SELECT') AS dob`)
    expect([r.any_sel, r.city, r.dob]).toEqual([false, false, false])
  })

  it('is denied at runtime, not merely by catalogue', async () => {
    expect(await asRole('anon', `SELECT city FROM public.user_demographics`)).toBe('42501')
    expect(await asRole('anon', `SELECT date_of_birth FROM public.user_demographics`)).toBe('42501')
  })

  it('cannot execute either date-of-birth function', async () => {
    const r = await one(`SELECT
      has_function_privilege('anon','public.user_age_status()','EXECUTE')            AS status_fn,
      has_function_privilege('anon','public.set_user_date_of_birth(date)','EXECUTE') AS write_fn`)
    expect([r.status_fn, r.write_fn]).toEqual([false, false])
    expect(await asRole('anon', `SELECT public.user_age_status()`)).toBe('42501')
  })
})

describe('date_of_birth is unreachable by every client role', () => {
  it('authenticated cannot READ the column', async () => {
    const r = await one(`SELECT
      has_column_privilege('authenticated','public.user_demographics','date_of_birth','SELECT')   AS dob,
      has_column_privilege('authenticated','public.user_demographics','age_declared_at','SELECT') AS declared,
      has_column_privilege('authenticated','public.user_demographics','dob_corrections','SELECT') AS corrections`)
    expect([r.dob, r.declared, r.corrections]).toEqual([false, false, false])
  })

  it('authenticated cannot WRITE the column — this is what makes the 18+ gate enforcement', async () => {
    const r = await one(`SELECT
      has_column_privilege('authenticated','public.user_demographics','date_of_birth','UPDATE')   AS dob_upd,
      has_column_privilege('authenticated','public.user_demographics','date_of_birth','INSERT')   AS dob_ins,
      has_column_privilege('authenticated','public.user_demographics','dob_corrections','UPDATE') AS cor_upd`)
    expect([r.dob_upd, r.dob_ins, r.cor_upd]).toEqual([false, false, false])
  })

  it('the owner is denied at runtime when selecting their own date of birth', async () => {
    expect(
      await asRole('authenticated', `SELECT date_of_birth FROM public.user_demographics`, SELF)
    ).toBe('42501')
  })

  it('the owner cannot clear their own correction counter to earn another attempt', async () => {
    expect(
      await asRole('authenticated', `UPDATE public.user_demographics SET dob_corrections = 0`, SELF)
    ).toBe('42501')
  })

  it('SELECT * is denied for authenticated, because * expands to date_of_birth', async () => {
    // Stated in the migration as a consequence. Pinned here so a future "just add
    // the column back to the grant list" change fails loudly.
    expect(
      await asRole('authenticated', `SELECT * FROM public.user_demographics`, SELF)
    ).toBe('42501')
  })

  it('but the granted column list IS readable, so the profile surface still works', async () => {
    const rows = await rowsAsRole(
      'authenticated',
      `SELECT gender, city, country, occupation FROM public.user_demographics`,
      SELF
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ gender: 'female', city: 'Ho Chi Minh City', country: 'VN' })
  })
})

describe('row isolation — one user cannot reach another', () => {
  it('a signed-in user sees ONLY their own row', async () => {
    const rows = await rowsAsRole(
      'authenticated', `SELECT user_id, city FROM public.user_demographics`, SELF
    )
    expect(rows.map((r) => r.user_id)).toEqual([SELF])
  })

  it('addressing another user by id returns nothing rather than their data', async () => {
    const rows = await rowsAsRole(
      'authenticated',
      `SELECT city FROM public.user_demographics WHERE user_id = '${OTHER}'`,
      SELF
    )
    expect(rows).toEqual([])
  })

  it('cannot UPDATE another user row', async () => {
    await asRole(
      'authenticated',
      `UPDATE public.user_demographics SET city = 'Injected' WHERE user_id = '${OTHER}'`,
      SELF
    )
    const r = await one(`SELECT city FROM public.user_demographics WHERE user_id = '${OTHER}'`)
    expect(r.city).toBe('Hanoi')
  })

  it('cannot INSERT a row owned by someone else', async () => {
    const code = await asRole(
      'authenticated',
      `INSERT INTO public.user_demographics (user_id, city) VALUES ('${OTHER}', 'Injected')`,
      SELF
    )
    // RLS WITH CHECK violation.
    expect(code).toBe('42501')
  })

  it('cannot DELETE its own row — that would reset the correction counter', async () => {
    // No DELETE grant and no DELETE policy: deleting the row would zero
    // dob_corrections, which is a correction-limit bypass dressed as a privacy
    // action. The FK cascade still removes it with the profile.
    const code = await asRole(
      'authenticated', `DELETE FROM public.user_demographics WHERE user_id = '${SELF}'`, SELF
    )
    expect(code).toBe('42501')
  })

  it('an unauthenticated authenticated-role session (no sub) sees nothing', async () => {
    const rows = await rowsAsRole('authenticated', `SELECT city FROM public.user_demographics`, null)
    expect(rows).toEqual([])
  })
})

describe('RLS configuration', () => {
  it('is enabled, with exactly the three own-row policies and no DELETE policy', async () => {
    const rls = await one(
      `SELECT relrowsecurity AS on FROM pg_class WHERE oid = 'public.user_demographics'::regclass`
    )
    expect(rls.on).toBe(true)

    const rows = await db.query(
      `SELECT policyname, cmd, roles::text FROM pg_policies
        WHERE schemaname='public' AND tablename='user_demographics' ORDER BY cmd`
    )
    expect(rows.rows.map((r) => r.cmd).sort()).toEqual(['INSERT', 'SELECT', 'UPDATE'])
    for (const r of rows.rows) expect(r.roles).toBe('{authenticated}')
  })
})

describe('`profiles` is untouched', () => {
  it('gained no demographic column', async () => {
    const r = await one(`SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles'
        AND column_name IN ('date_of_birth','age','age_band','gender','occupation',
                            'industry','education_level','dob_corrections')`)
    expect(r.n).toBe(0)
  })

  it('kept its open policies — the migration changed nothing about it', async () => {
    const r = await one(`SELECT count(*)::int AS n FROM pg_policies
      WHERE schemaname='public' AND tablename='profiles'`)
    expect(r.n).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The two SECURITY DEFINER functions — the ONLY path to date_of_birth.
// ─────────────────────────────────────────────────────────────────────────────

describe('user_age_status() — derived values only', () => {
  it('is SECURITY DEFINER with a pinned search_path', async () => {
    const r = await one(`SELECT p.prosecdef AS secdef, p.proconfig::text AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='user_age_status'`)
    expect(r.secdef).toBe(true)
    expect(r.cfg).toContain('search_path=public')
  })

  it('returns a band and an age for the caller, and NEVER a date', async () => {
    const rows = await rowsAsRole('authenticated', `SELECT * FROM public.user_age_status()`, SELF)
    expect(rows).toHaveLength(1)
    expect(rows[0].has_dob).toBe(true)
    expect(typeof rows[0].age_years).toBe('number')
    expect(rows[0].age_band).toMatch(/^(18_24|25_34|35_44|45_54|55_64|65_plus|under_18)$/)
    // The whole point: no date of birth crosses this boundary.
    expect(Object.keys(rows[0])).toEqual(['has_dob', 'age_years', 'age_band', 'corrections_used'])
  })

  it('keys on auth.uid() and takes no user id, so it cannot be asked about someone else', async () => {
    const selfRows = await rowsAsRole('authenticated', `SELECT * FROM public.user_age_status()`, SELF)
    const otherRows = await rowsAsRole('authenticated', `SELECT * FROM public.user_age_status()`, OTHER)
    // Different subjects, different answers — from the same zero-argument call.
    expect(selfRows[0].age_years).not.toBe(otherRows[0].age_years)

    const args = await one(`SELECT pg_get_function_identity_arguments(p.oid) AS a
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='user_age_status'`)
    expect(args.a).toBe('')
  })

  it('reports has_dob = false for a user who has never been asked', async () => {
    const rows = await rowsAsRole('authenticated', `SELECT * FROM public.user_age_status()`, NOROW)
    expect(rows[0].has_dob).toBe(false)
    expect(rows[0].age_years).toBeNull()
    expect(rows[0].age_band).toBeNull()
  })

  it('bands correctly at the boundary, including the not-yet-had-a-birthday case', async () => {
    // Exactly 18 today.
    await db.query(
      `INSERT INTO public.user_demographics (user_id, date_of_birth)
       VALUES ('${NOROW}', (CURRENT_DATE - INTERVAL '18 years')::date)
       ON CONFLICT (user_id) DO UPDATE SET date_of_birth = EXCLUDED.date_of_birth`
    )
    let rows = await rowsAsRole('authenticated', `SELECT * FROM public.user_age_status()`, NOROW)
    expect(rows[0].age_years).toBe(18)
    expect(rows[0].age_band).toBe('18_24')

    // One day short of 18 — the case a naive year-subtraction gets wrong.
    await db.query(
      `UPDATE public.user_demographics
          SET date_of_birth = (CURRENT_DATE - INTERVAL '18 years' + INTERVAL '1 day')::date
        WHERE user_id = '${NOROW}'`
    )
    rows = await rowsAsRole('authenticated', `SELECT * FROM public.user_age_status()`, NOROW)
    expect(rows[0].age_years).toBe(17)
    expect(rows[0].age_band).toBe('under_18')

    // Leave the row as the harness found it.
    await db.query(`DELETE FROM public.user_demographics WHERE user_id = '${NOROW}'`)
  })
})

describe('set_user_date_of_birth() — the one-self-correction rule', () => {
  const FRESH = NOROW

  beforeEach(async () => {
    await db.query(`DELETE FROM public.user_demographics WHERE user_id = '${FRESH}'`)
  })

  /** Calls the writer as `sub` and returns its status code. */
  const write = async (sub: string, dob: string) => {
    const rows = await rowsAsRole(
      'authenticated', `SELECT public.set_user_date_of_birth(DATE '${dob}') AS r`, sub
    )
    return rows[0].r as string
  }

  it('records a first date of birth', async () => {
    expect(await write(FRESH, '1990-01-01')).toBe('recorded')
  })

  it('allows exactly ONE correction, then refuses', async () => {
    expect(await write(FRESH, '1990-01-01')).toBe('recorded')
    expect(await write(FRESH, '1991-02-02')).toBe('corrected')
    expect(await write(FRESH, '1992-03-03')).toBe('correction_exhausted')
    // …and the refusal is real: the stored value is still the corrected one.
    const r = await one(`SELECT date_of_birth::text AS d FROM public.user_demographics WHERE user_id='${FRESH}'`)
    expect(r.d).toBe('1991-02-02')
  })

  it('re-submitting the SAME date does not consume the allowance', async () => {
    // A double-tap or a retry after a network failure must not cost the user
    // their one chance to fix a genuine mistake.
    expect(await write(FRESH, '1990-01-01')).toBe('recorded')
    expect(await write(FRESH, '1990-01-01')).toBe('unchanged')
    expect(await write(FRESH, '1990-01-01')).toBe('unchanged')
    expect(await write(FRESH, '1995-05-05')).toBe('corrected')
  })

  it('an under-18 user cannot retry their way to eligibility', async () => {
    const thisYear = new Date().getUTCFullYear()
    expect(await write(FRESH, `${thisYear - 10}-01-01`)).toBe('recorded')
    expect(await write(FRESH, `${thisYear - 30}-01-01`)).toBe('corrected')
    // Third attempt refused — the gate is enforcement, not a prompt to retry.
    expect(await write(FRESH, `${thisYear - 40}-01-01`)).toBe('correction_exhausted')
  })

  it('refuses an anonymous identity', async () => {
    const rows = await rowsAsRole(
      'authenticated', `SELECT public.set_user_date_of_birth(DATE '1990-01-01') AS r`, ANON_USER
    )
    expect(rows[0].r).toBe('anonymous_not_eligible')
    const n = await one(`SELECT count(*)::int AS n FROM public.user_demographics WHERE user_id='${ANON_USER}'`)
    expect(n.n).toBe(0)
  })

  it('refuses an unauthenticated caller', async () => {
    const rows = await rowsAsRole(
      'authenticated', `SELECT public.set_user_date_of_birth(DATE '1990-01-01') AS r`, null
    )
    expect(rows[0].r).toBe('unauthenticated')
  })

  it('refuses a future date and a null', async () => {
    const rows = await rowsAsRole(
      'authenticated',
      `SELECT public.set_user_date_of_birth((CURRENT_DATE + 1)) AS a,
              public.set_user_date_of_birth(NULL) AS b`,
      FRESH
    )
    expect([rows[0].a, rows[0].b]).toEqual(['invalid_date', 'invalid_date'])
  })

  it('writes onto an existing row created by an ordinary profile edit', async () => {
    // A user may have saved a city long before ever being asked their age.
    await asRole(
      'authenticated',
      `INSERT INTO public.user_demographics (user_id, city) VALUES ('${FRESH}', 'Da Nang')`,
      FRESH
    )
    expect(await write(FRESH, '1990-01-01')).toBe('recorded')
    const r = await one(`SELECT city, date_of_birth::text AS d FROM public.user_demographics WHERE user_id='${FRESH}'`)
    expect(r.city).toBe('Da Nang')
    expect(r.d).toBe('1990-01-01')
  })

  it('never returns the stored date, only a status code', async () => {
    await write(FRESH, '1990-01-01')
    const t = await one(`SELECT pg_get_function_result(p.oid) AS t
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='set_user_date_of_birth'`)
    expect(t.t).toBe('text')
  })
})

describe('constraints', () => {
  const T = NOROW

  beforeEach(async () => {
    await db.query(`DELETE FROM public.user_demographics WHERE user_id = '${T}'`)
  })

  it('rejects a gender outside the option set', async () => {
    const code = await asRole(
      'authenticated',
      `INSERT INTO public.user_demographics (user_id, gender) VALUES ('${T}', 'not_an_option')`,
      T
    )
    expect(code).toBe('23514') // check_violation
  })

  it('accepts all four canonical gender values', async () => {
    for (const g of ['female', 'male', 'other', 'prefer_not_to_say']) {
      await db.query(`DELETE FROM public.user_demographics WHERE user_id='${T}'`)
      const code = await asRole(
        'authenticated',
        `INSERT INTO public.user_demographics (user_id, gender) VALUES ('${T}', '${g}')`,
        T
      )
      expect(code, `gender=${g}`).toBeNull()
    }
  })

  it('rejects a self-description without `other` selected', async () => {
    const code = await asRole(
      'authenticated',
      `INSERT INTO public.user_demographics (user_id, gender, gender_self_describe)
       VALUES ('${T}', 'female', 'something')`,
      T
    )
    expect(code).toBe('23514')
  })

  it('rejects a country that is not ISO-3166-1 alpha-2 upper case', async () => {
    for (const c of ['vn', 'VNM', 'V']) {
      const code = await asRole(
        'authenticated',
        `INSERT INTO public.user_demographics (user_id, country) VALUES ('${T}', '${c}')`,
        T
      )
      expect(code, `country=${c}`).toBe('23514')
    }
  })

  it('is 1:1 with profiles and cascades on profile delete', async () => {
    await db.query(
      `INSERT INTO auth.users (id, email) VALUES ('55555555-5555-4555-8555-555555555555','c@example.com')`
    )
    await db.query(`INSERT INTO public.profiles (id, full_name) VALUES ('55555555-5555-4555-8555-555555555555','Cascade')`)
    await db.query(
      `INSERT INTO public.user_demographics (user_id, city) VALUES ('55555555-5555-4555-8555-555555555555','Hue')`
    )
    await db.query(`DELETE FROM public.profiles WHERE id = '55555555-5555-4555-8555-555555555555'`)
    const r = await one(
      `SELECT count(*)::int AS n FROM public.user_demographics WHERE user_id = '55555555-5555-4555-8555-555555555555'`
    )
    expect(r.n).toBe(0)
  })

  it('an anonymous identity cannot acquire a row even by direct INSERT — the FK forbids it', async () => {
    // 20260808c gives an anonymous identity no `profiles` row, and the FK points
    // at `profiles`. The structural guarantee, independent of the function check.
    const code = await asRole(
      'authenticated',
      `INSERT INTO public.user_demographics (user_id, city) VALUES ('${ANON_USER}', 'Nowhere')`,
      ANON_USER
    )
    // Either RLS (42501) or the FK (23503) stops it; both are correct refusals.
    expect(['42501', '23503']).toContain(code)
  })
})

describe('service_role retains the administrative path', () => {
  it('can read every column, including date_of_birth', async () => {
    const rows = await rowsAsRole(
      'service_role', `SELECT user_id, date_of_birth FROM public.user_demographics ORDER BY user_id`
    )
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0].date_of_birth).toBeInstanceOf(Date)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The support/admin correction path — the remedy for a spent self-correction.
// ─────────────────────────────────────────────────────────────────────────────

describe('age_band_of — one banding derivation, shared', () => {
  it('is not executable by any client role', async () => {
    const r = await one(`SELECT
      has_function_privilege('anon','public.age_band_of(date)','EXECUTE')          AS anon_exec,
      has_function_privilege('authenticated','public.age_band_of(date)','EXECUTE') AS auth_exec`)
    expect([r.anon_exec, r.auth_exec]).toEqual([false, false])
  })

  it('agrees with user_age_status() for the same person', async () => {
    // The whole reason the helper was extracted. Two derivations of the same
    // band would be a silent, permanent defect in the dimension the audience
    // foundation keys on.
    const viaFn = await one(`SELECT public.age_band_of(DATE '1994-03-15') AS b`)
    const viaStatus = await rowsAsRole('authenticated', `SELECT * FROM public.user_age_status()`, SELF)
    expect(viaStatus[0].age_band).toBe(viaFn.b)
  })

  it('returns null for no date rather than a band', async () => {
    const r = await one(`SELECT public.age_band_of(NULL) AS b`)
    expect(r.b).toBeNull()
  })
})

describe('admin_set_user_date_of_birth', () => {
  const TARGET = NOROW
  const ACTOR = '66666666-6666-4666-8666-666666666666'
  const REASON = 'user contacted support after mistyping their birth year at signup'

  const adminCall = (
    dob: string, reason = REASON, email = 'ops@tappyai.com', role = 'admin'
  ) =>
    db.query(
      `SELECT public.admin_set_user_date_of_birth($1::uuid, $2::date, $3::uuid, $4, $5, $6) AS r`,
      [TARGET, dob, ACTOR, email, role, reason]
    ).then((r) => r.rows[0].r as string)

  /** The user's own self-service write, for the lockout scenario. */
  const selfWrite = async (dob: string) =>
    (await rowsAsRole(
      'authenticated', `SELECT public.set_user_date_of_birth(DATE '${dob}') AS r`, TARGET
    ))[0].r as string

  beforeEach(async () => {
    await db.query(`DELETE FROM public.user_demographics WHERE user_id = '${TARGET}'`)
    await db.query('DELETE FROM public.audit_log')
  })

  it('is executable by service_role ONLY', async () => {
    const sig = 'public.admin_set_user_date_of_birth(uuid,date,uuid,text,text,text)'
    const r = await one(`SELECT
      has_function_privilege('anon','${sig}','EXECUTE')          AS anon_exec,
      has_function_privilege('authenticated','${sig}','EXECUTE') AS auth_exec,
      has_function_privilege('service_role','${sig}','EXECUTE')  AS svc_exec`)
    expect([r.anon_exec, r.auth_exec, r.svc_exec]).toEqual([false, false, true])
  })

  it('a signed-in user cannot call it to rewrite anyone — including themselves', async () => {
    // This is the one function here that can write a date of birth for somebody
    // OTHER than the caller. No PostgREST role may reach it.
    const code = await asRole(
      'authenticated',
      `SELECT public.admin_set_user_date_of_birth('${TARGET}'::uuid, DATE '1990-01-01', ` +
      `'${ACTOR}'::uuid, 'a@b.c', 'admin', '${REASON}')`,
      TARGET
    )
    expect(code).toBe('42501')
  })

  it('rescues a user who has spent their single self-correction', async () => {
    // The scenario this exists for, end to end.
    const thisYear = new Date().getUTCFullYear()
    expect(await selfWrite(`${thisYear - 10}-01-01`)).toBe('recorded')
    expect(await selfWrite(`${thisYear - 11}-01-01`)).toBe('corrected')
    expect(await selfWrite('1990-01-01')).toBe('correction_exhausted')

    // Locked out and unable to help themselves. Support can.
    expect(await adminCall('1990-01-01')).toBe('corrected')
    const status = await rowsAsRole('authenticated', `SELECT * FROM public.user_age_status()`, TARGET)
    expect(status[0].age_years).toBeGreaterThanOrEqual(18)
  })

  it('does NOT hand back a fresh self-service allowance', async () => {
    await selfWrite('2000-01-01')
    await selfWrite('2001-01-01') // allowance spent
    await adminCall('1990-01-01')
    // Still spent — the user needed the RIGHT value, not another attempt.
    expect(await selfWrite('1985-01-01')).toBe('correction_exhausted')
    const r = await one(
      `SELECT dob_corrections, admin_corrections FROM public.user_demographics WHERE user_id='${TARGET}'`
    )
    expect(r.dob_corrections).toBe(1)
    expect(r.admin_corrections).toBe(1)
  })

  it('counts repeated admin corrections', async () => {
    await adminCall('1990-01-01')
    await adminCall('1991-01-01')
    const r = await one(
      `SELECT admin_corrections FROM public.user_demographics WHERE user_id='${TARGET}'`
    )
    expect(r.admin_corrections).toBe(2)
  })

  it('refuses without a written reason of at least 20 characters', async () => {
    expect(await adminCall('1990-01-01', 'fix')).toBe('reason_too_short')
    expect(await adminCall('1990-01-01', '   ')).toBe('reason_too_short')
    const n = await one(
      `SELECT count(*)::int AS n FROM public.user_demographics WHERE user_id='${TARGET}'`
    )
    expect(n.n).toBe(0) // refused means nothing was written
  })

  it('refuses an unidentified actor', async () => {
    expect(await adminCall('1990-01-01', REASON, '', 'admin')).toBe('invalid_actor')
    expect(await adminCall('1990-01-01', REASON, 'a@b.c', '  ')).toBe('invalid_actor')
  })

  it('refuses an invalid or future date', async () => {
    expect(await adminCall('1899-01-01')).toBe('invalid_date')
    const next = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(await adminCall(next)).toBe('invalid_date')
  })

  it('refuses a subject with no profile — including an anonymous identity', async () => {
    const r = await db.query(
      `SELECT public.admin_set_user_date_of_birth($1::uuid, DATE '1990-01-01', $2::uuid, 'a@b.c', 'admin', $3) AS r`,
      [ANON_USER, ACTOR, REASON]
    )
    expect(r.rows[0].r).toBe('user_not_found')
  })

  it('writes exactly one audit row, naming the actor, the target and the reason', async () => {
    await adminCall('1990-01-01')
    const rows = (await db.query(`SELECT * FROM public.audit_log`)).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_id: ACTOR,
      actor_email: 'ops@tappyai.com',
      actor_role: 'admin',
      action: 'user.date_of_birth.corrected',
      target_type: 'user',
      target_id: TARGET,
    })
    expect(rows[0].metadata.reason).toBe(REASON)
  })

  it('🚨 records the BAND and never the date of birth', async () => {
    // Copying the raw value into a second table with different retention would
    // recreate exactly the duplication this whole design removes.
    await adminCall('1990-06-15')
    const row = (await db.query(`SELECT before_state, after_state, metadata FROM public.audit_log`)).rows[0]
    const serialised = JSON.stringify(row)

    // The invariant is about the VALUE, not the word. `had_date_of_birth` is a
    // boolean saying whether one existed, which is exactly the reviewable fact
    // an auditor needs and carries none of the sensitive content — so a blanket
    // ban on the substring would forbid the right thing along with the wrong one.
    expect(serialised).not.toContain('1990-06-15')
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}/)  // no calendar date, in any field
    expect(typeof row.before_state.had_date_of_birth).toBe('boolean')

    // …and it does say enough to review the decision.
    expect(row.after_state.age_band).toBe('35_44')
    expect(row.before_state.had_date_of_birth).toBe(false)
  })

  it('writes no audit row when it refuses', async () => {
    await adminCall('1990-01-01', 'too short')
    const n = await one(`SELECT count(*)::int AS n FROM public.audit_log`)
    expect(n.n).toBe(0)
  })

  it('never returns the stored date, only a status code', async () => {
    const t = await one(`SELECT pg_get_function_result(p.oid) AS t
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='admin_set_user_date_of_birth'`)
    expect(t.t).toBe('text')
  })
})
