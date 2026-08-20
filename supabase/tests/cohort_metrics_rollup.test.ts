import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// Controller V2 - Module 04 User Analytics, RETENTION: `cohort_metrics` + rollup.
//
// CONTRACT
//   04_Database_Architecture.md §3.3  the authoritative DDL. NOT §7 - §7 is
//                                     "Existing Table Modifications" and does
//                                     not define this table.
//   25_KPI_Definitions.md §4          "classic (bracket) retention for D1/D7/D30
//                                     (active on EXACTLY that day)". Rolling
//                                     retention is a separate, secondary view
//                                     and is NOT this table.
//   06_Analytics_Architecture.md §6   the rollup steps: find cohorts at their
//                                     milestone, count who was active, UPSERT.
//   ADR-008                           the reporting day is Asia/Ho_Chi_Minh.
//
// FOUR PLACES WHERE THE DOCS AND THE DATABASE DISAGREE, resolved from the
// authoritative sources and recorded here so the resolution is reviewable:
//
//  1. `04` §7A and `06` §8C both say retention derives from `user_active_days`.
//     THAT TABLE DOES NOT EXIST. §8C itself frames it as a PERFORMANCE
//     structure - "all retention queries become index scans over a small
//     table", trade-off "one extra derived table to maintain" - producing the
//     same facts as the event stream. So retention derives from `user_events`,
//     which is exactly what M01's already-in-production rollup does for
//     DAU/WAU/MAU. Same source, same numbers, no new table.
//
//  2. `06` §6 specifies a SEPARATE `cohort-rollup` cron at 00:10 UTC. 00:10 UTC
//     is 07:10 VN - seven hours INTO the VN day it would be measuring. Folding
//     this into `analytics-snapshot` at 00:05 VN measures a day that has just
//     CLOSED, which is what ADR-008 is for.
//
//  3. §3.3 gives the rate columns `DEFAULT 0`. A rate of 0 for a cohort of 0
//     users is the false `0%` Module 04 exists to refuse. The columns are
//     NULLABLE, so the DDL already permits the honest value; the rollup always
//     writes an explicit one, so the DEFAULT never applies. DDL kept VERBATIM.
//
//  4. Counts are NOT NULL, rates are nullable - and that asymmetry is the
//     design. A count is a fact about what was observed. A rate is a CLAIM
//     about a cohort, and it can only be made once the milestone day has
//     closed and the cohort is non-empty.
//
// SCOPE. Schema, access boundary, and the aggregation's semantics against a
// real PostgreSQL. The API and the page have their own suites.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260820_m04_cohort_metrics.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

const PORT = 54361
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const U3 = '33333333-3333-4333-8333-333333333333'
const U4 = '44444444-4444-4444-8444-444444444444'

/** The production baseline this migration lands on. */
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- ADR-019: a new table AND a new function in this schema are BORN fully open.
  -- Without BOTH lines every REVOKE assertion below passes vacuously. The
  -- FUNCTIONS half is the one B8's harness was missing.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE public.user_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, event_type TEXT NOT NULL, metadata JSONB DEFAULT '{}',
    anon_id UUID, platform TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Control object: same open defaults, never revoked. If an assertion below
  -- would pass against THIS table too, it is not measuring the migration.
  CREATE TABLE public.harness_control (id INT PRIMARY KEY);
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query(sql, params)).rows[0] as T

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

/** Seed one profile whose VN registration day is `vnDate`. */
const profile = (id: string, vnDate: string) =>
  db.query(`INSERT INTO profiles (id, created_at) VALUES ($1, $2::timestamptz)`, [
    id,
    `${vnDate}T09:00:00+07:00`,
  ])

/** Seed one activity event at a given ABSOLUTE instant. */
const event = (userId: string, atIso: string, type = 'page_view') =>
  db.query(`INSERT INTO user_events (user_id, event_type, created_at) VALUES ($1,$2,$3::timestamptz)`, [
    userId,
    type,
    atIso,
  ])

/** An event on VN calendar day `vnDate`, mid-day so the date is unambiguous. */
const eventOnVnDay = (userId: string, vnDate: string) => event(userId, `${vnDate}T09:00:00+07:00`)

/**
 * Recompute cohorts in [from, to], evaluated as if "today" in Vietnam were
 * `today`. `p_today` is a PARAMETER and not `now()`: a milestone is measurable
 * only once its day has closed, and a function that decides that from the
 * server clock cannot be tested for it.
 */
const rollup = (from: string, to: string, today: string) =>
  db.query(`SELECT fn_rollup_cohort_metrics($1::date, $2::date, $3::date)`, [from, to, today])

type Cohort = {
  cohort_date: string
  platform: string
  cohort_size: number
  d1_retained: number
  d7_retained: number
  d30_retained: number
  d1_rate: string | null
  d7_rate: string | null
  d30_rate: string | null
  computed_at: string
}

const cohort = (date: string) =>
  one<Cohort>(`SELECT * FROM cohort_metrics WHERE cohort_date = $1 AND platform = 'all'`, [date])

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-m04-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()

  // ⚠️ PIN THE SESSION TIMEZONE TO UTC, AND NOT AS TIDINESS.
  //
  // `(timestamptz)::date` casts using the SESSION TimeZone. This machine is in
  // Vietnam, so PostgreSQL inherits `Asia/Ho_Chi_Minh` — which makes a bare cast
  // and an explicit `AT TIME ZONE 'Asia/Ho_Chi_Minh'` produce identical results.
  // In M01 that let a mutation deleting the explicit conversion SURVIVE: every
  // timezone assertion passed for an environment-dependent reason, and on a UTC
  // CI runner the same code would have bucketed differently.
  //
  // Forcing UTC makes the explicit conversion the ONLY thing that can produce a
  // VN calendar day, which is what these tests are actually about.
  await db.query(`SET TimeZone = 'UTC'`)

  await db.query(PRELUDE)
  await db.query(MIGRATION)
}, 180_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file lock */ }
})

beforeEach(async () => {
  await db.query('TRUNCATE cohort_metrics, user_events, profiles')
})

// ===========================================================================
// SCHEMA — the table matches `04` §3.3 exactly.
// ===========================================================================
describe('schema — §3.3, verbatim', () => {
  it('the table exists', async () => {
    const r = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_class WHERE relname='cohort_metrics' AND relkind='r'`
    )
    expect(r.n).toBe('1')
  })

  it('has exactly the §3.3 columns — no speculative dimensions were added', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='cohort_metrics' ORDER BY column_name`
    )
    expect(rows.map((r) => r.column_name)).toEqual([
      'cohort_date', 'cohort_size', 'computed_at',
      'd1_rate', 'd1_retained', 'd30_rate', 'd30_retained', 'd7_rate', 'd7_retained',
      'id', 'platform',
    ])
  })

  it('cohort_date is DATE, never a timestamp — a calendar day has its timezone already resolved', async () => {
    const r = await one<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name='cohort_metrics' AND column_name='cohort_date'`
    )
    expect(r.data_type).toBe('date')
  })

  it('the rate columns are NUMERIC(5,4) — 0.0000 to 1.0000 at four decimal places', async () => {
    const { rows } = await db.query<{ column_name: string; numeric_precision: number; numeric_scale: number }>(
      `SELECT column_name, numeric_precision, numeric_scale FROM information_schema.columns
        WHERE table_name='cohort_metrics' AND column_name LIKE 'd%_rate' ORDER BY column_name`
    )
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      expect([r.column_name, r.numeric_precision, r.numeric_scale]).toEqual([r.column_name, 5, 4])
    }
  })

  it('🔑 COUNTS are NOT NULL and RATES are NULLABLE — the asymmetry is the design', async () => {
    const { rows } = await db.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name='cohort_metrics'
          AND (column_name LIKE 'd%_retained' OR column_name LIKE 'd%_rate' OR column_name='cohort_size')`
    )
    const nullable = Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable]))
    // A count is a fact about what was observed.
    expect(nullable.cohort_size).toBe('NO')
    expect(nullable.d1_retained).toBe('NO')
    expect(nullable.d7_retained).toBe('NO')
    expect(nullable.d30_retained).toBe('NO')
    // A rate is a CLAIM, and NULL is how the table says it cannot make one.
    expect(nullable.d1_rate).toBe('YES')
    expect(nullable.d7_rate).toBe('YES')
    expect(nullable.d30_rate).toBe('YES')
  })

  it('UNIQUE (cohort_date, platform) — the grain, so a re-run overwrites instead of appending', async () => {
    const r = await one<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) def FROM pg_constraint
        WHERE conrelid='public.cohort_metrics'::regclass AND contype='u'`
    )
    expect(r.def).toBe('UNIQUE (cohort_date, platform)')
  })

  it('a duplicate (cohort_date, platform) is REJECTED, not silently stored', async () => {
    await db.query(`INSERT INTO cohort_metrics (cohort_date, platform) VALUES ('2026-08-01','all')`)
    await expect(
      db.query(`INSERT INTO cohort_metrics (cohort_date, platform) VALUES ('2026-08-01','all')`)
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('the §3.3 index on (cohort_date DESC) exists', async () => {
    const r = await one<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename='cohort_metrics' AND indexname='idx_cohort_metrics_date'`
    )
    expect(r.indexdef).toContain('cohort_date DESC')
  })

  it('platform defaults to \'all\' per §3.3', async () => {
    await db.query(`INSERT INTO cohort_metrics (cohort_date) VALUES ('2026-08-01')`)
    const r = await cohort('2026-08-01')
    expect(r.platform).toBe('all')
  })
})

// ===========================================================================
// SECURITY — ADR-019. Analytics rollups are service-tier only.
// ===========================================================================
describe('security — the boundary, not the default', () => {
  it('anon cannot read the table', async () => {
    expect(await asRole('anon', `SELECT * FROM cohort_metrics`)).toBe('42501')
  })

  it('authenticated cannot read the table — a logged-in user is not an operator', async () => {
    expect(await asRole('authenticated', `SELECT * FROM cohort_metrics`)).toBe('42501')
  })

  it('anon and authenticated cannot WRITE either', async () => {
    const stmt = `INSERT INTO cohort_metrics (cohort_date) VALUES ('2026-08-01')`
    expect(await asRole('anon', stmt)).toBe('42501')
    expect(await asRole('authenticated', stmt)).toBe('42501')
  })

  it('🔑 the control table IS reachable — proving the harness grants are real', async () => {
    // Without this, every 42501 above could just mean "the harness never granted
    // anything", and the REVOKEs would be untested.
    expect(await asRole('anon', `SELECT * FROM harness_control`)).toBeNull()
  })

  it('RLS is enabled with ZERO policies — a missing policy is a denial', async () => {
    const r = await one<{ relrowsecurity: boolean; policies: string }>(
      `SELECT c.relrowsecurity,
              (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='cohort_metrics') policies
         FROM pg_class c WHERE c.oid='public.cohort_metrics'::regclass`
    )
    expect(r.relrowsecurity).toBe(true)
    expect(r.policies).toBe('0')
  })

  it('service_role keeps access — it is the API tier behind the PDP', async () => {
    expect(await asRole('service_role', `SELECT * FROM cohort_metrics`)).toBeNull()
  })

  it('anon and authenticated cannot EXECUTE the rollup', async () => {
    const call = `SELECT fn_rollup_cohort_metrics('2026-08-01','2026-08-01','2026-08-02')`
    expect(await asRole('anon', call)).toBe('42501')
    expect(await asRole('authenticated', call)).toBe('42501')
  })

  it('the rollup is SECURITY DEFINER with a pinned search_path', async () => {
    const r = await one<{ prosecdef: boolean; cfg: string[] | null }>(
      `SELECT prosecdef, proconfig cfg FROM pg_proc WHERE proname='fn_rollup_cohort_metrics'`
    )
    expect(r.prosecdef).toBe(true)
    expect(r.cfg).toContain('search_path=public, pg_temp')
  })
})

// ===========================================================================
// COHORT SEMANTICS — who is in the cohort, and on which day.
// ===========================================================================
describe('cohort membership', () => {
  it('the cohort date is the VN calendar day of REGISTRATION', async () => {
    await profile(U1, '2026-08-01')
    await profile(U2, '2026-08-01')
    await profile(U3, '2026-08-02')
    await rollup('2026-08-01', '2026-08-02', '2026-09-15')
    expect((await cohort('2026-08-01')).cohort_size).toBe(2)
    expect((await cohort('2026-08-02')).cohort_size).toBe(1)
  })

  it('a row is written for a day with NO registrations — absent and empty are different facts', async () => {
    await profile(U1, '2026-08-01')
    await rollup('2026-08-01', '2026-08-03', '2026-09-15')
    const empty = await cohort('2026-08-02')
    expect(empty).toBeDefined()
    expect(empty.cohort_size).toBe(0)
  })

  it('only the cohort\'s own members count toward its retention', async () => {
    await profile(U1, '2026-08-01')   // in the cohort
    await profile(U2, '2026-08-05')   // registered later, NOT in it
    await eventOnVnDay(U1, '2026-08-02')
    await eventOnVnDay(U2, '2026-08-02') // active on the same day, different cohort
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(1)
  })

  it('🔑 a user active MANY times on the milestone day counts ONCE', async () => {
    await profile(U1, '2026-08-01')
    await event(U1, '2026-08-02T01:00:00+07:00')
    await event(U1, '2026-08-02T09:00:00+07:00')
    await event(U1, '2026-08-02T23:00:00+07:00')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(1)
  })

  // NOTE ON MUTATION R09. Deleting `WHERE e.user_id IS NOT NULL` from the
  // rollup leaves this test passing, and that is not a weak assertion — it is
  // an EQUIVALENT MUTANT. `JOIN signup s ON s.user_id = a.user_id` compares
  // NULL to a value, which is UNKNOWN, so an anonymous row can never match a
  // cohort member however the CTE is filtered. The explicit filter stays
  // because it keeps anonymous traffic out of the scan, not because it is what
  // enforces the rule. The behaviour below is worth pinning either way.
  it('anonymous events cannot retain anybody — they carry no user_id', async () => {
    await profile(U1, '2026-08-01')
    await db.query(
      `INSERT INTO user_events (user_id, anon_id, event_type, created_at)
       VALUES (NULL, gen_random_uuid(), 'page_view', '2026-08-02T09:00:00+07:00'::timestamptz)`
    )
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(0)
  })
})

// ===========================================================================
// RETENTION — CLASSIC (BRACKET): active on EXACTLY day C+N (`25` §4).
// ===========================================================================
describe('classic bracket retention — exactly that day, not "any day after"', () => {
  beforeEach(() => profile(U1, '2026-08-01'))

  it('D1 counts activity on C+1', async () => {
    await eventOnVnDay(U1, '2026-08-02')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    const c = await cohort('2026-08-01')
    expect(c.d1_retained).toBe(1)
    expect(c.d1_rate).toBe('1.0000')
  })

  it('D7 counts activity on C+7', async () => {
    await eventOnVnDay(U1, '2026-08-08')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d7_retained).toBe(1)
  })

  it('D30 counts activity on C+30', async () => {
    await eventOnVnDay(U1, '2026-08-31')
    await rollup('2026-08-01', '2026-08-01', '2026-10-15')
    expect((await cohort('2026-08-01')).d30_retained).toBe(1)
  })

  it('🔑 activity on C+2 does NOT satisfy D1 — bracket, not rolling', async () => {
    // `25` §4: rolling retention ("active on ANY day >= C+N") is a SEPARATE,
    // secondary view backed by `user_active_days`. Conflating them silently
    // inflates every number on the page.
    await eventOnVnDay(U1, '2026-08-03')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(0)
  })

  it('activity on C+8 does NOT satisfy D7', async () => {
    await eventOnVnDay(U1, '2026-08-09')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d7_retained).toBe(0)
  })

  it('activity on day C itself retains nobody — the signup day is not a return', async () => {
    await eventOnVnDay(U1, '2026-08-01')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    const c = await cohort('2026-08-01')
    expect([c.d1_retained, c.d7_retained, c.d30_retained]).toEqual([0, 0, 0])
  })

  it('the three milestones are independent — one user can satisfy all three', async () => {
    await eventOnVnDay(U1, '2026-08-02')
    await eventOnVnDay(U1, '2026-08-08')
    await eventOnVnDay(U1, '2026-08-31')
    await rollup('2026-08-01', '2026-08-01', '2026-10-15')
    const c = await cohort('2026-08-01')
    expect([c.d1_retained, c.d7_retained, c.d30_retained]).toEqual([1, 1, 1])
  })

  it('the rate is retained / cohort_size, at four decimal places', async () => {
    await profile(U2, '2026-08-01')
    await profile(U3, '2026-08-01')  // cohort of 3 with U1
    await eventOnVnDay(U1, '2026-08-02')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    const c = await cohort('2026-08-01')
    expect(c.cohort_size).toBe(3)
    expect(c.d1_rate).toBe('0.3333')
  })
})

// ===========================================================================
// THE UNMEASURABLE — where Module 04's rules meet the schema.
// ===========================================================================
describe('🔑 a rate that cannot be measured is NULL, never 0%', () => {
  it('an EMPTY cohort has NULL rates and zero counts', async () => {
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    const c = await cohort('2026-08-01')
    expect(c.cohort_size).toBe(0)
    expect([c.d1_rate, c.d7_rate, c.d30_rate]).toEqual([null, null, null])
    expect([c.d1_retained, c.d7_retained, c.d30_retained]).toEqual([0, 0, 0])
  })

  it('a real 0% IS reported — nobody returned is a measurement', async () => {
    // The distinction that makes the test above meaningful: an empty cohort
    // cannot have a rate, but a cohort where nobody came back HAS one, and it
    // is 0. Collapsing these two into the same value loses a real fact.
    await profile(U1, '2026-08-01')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    const c = await cohort('2026-08-01')
    expect(c.cohort_size).toBe(1)
    expect(c.d1_rate).toBe('0.0000')
  })

  it('a cohort whose D30 has NOT ARRIVED yet has a NULL d30_rate', async () => {
    await profile(U1, '2026-08-01')
    await eventOnVnDay(U1, '2026-08-02')
    // "Today" is 2026-08-03: D1 (08-02) has closed, D7 (08-08) and D30 (08-31)
    // have not. Reporting 0% for them would say "nobody came back on day 30" of
    // a day that has not happened.
    await rollup('2026-08-01', '2026-08-01', '2026-08-03')
    const c = await cohort('2026-08-01')
    expect(c.d1_rate).toBe('1.0000')
    expect(c.d7_rate).toBeNull()
    expect(c.d30_rate).toBeNull()
  })

  it('🔑 the milestone day must be CLOSED — today is not measurable', async () => {
    // At 00:05 VN on day D the cron measures D-1. If D1 falls on D itself, the
    // day is five minutes old; a rate computed from it would change by evening.
    await profile(U1, '2026-08-01')
    await rollup('2026-08-01', '2026-08-01', '2026-08-02') // today IS the D1 day
    expect((await cohort('2026-08-01')).d1_rate).toBeNull()
  })

  it('the same milestone becomes measurable the day after it closes', async () => {
    await profile(U1, '2026-08-01')
    await eventOnVnDay(U1, '2026-08-02')
    await rollup('2026-08-01', '2026-08-01', '2026-08-03')
    expect((await cohort('2026-08-01')).d1_rate).toBe('1.0000')
  })

  it('no rate is ever NaN or Infinity — a divide by zero never reaches the column', async () => {
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    const { rows } = await db.query<{ bad: string }>(
      `SELECT count(*) bad FROM cohort_metrics
        WHERE d1_rate = 'NaN'::numeric OR d7_rate = 'NaN'::numeric OR d30_rate = 'NaN'::numeric`
    )
    expect(rows[0].bad).toBe('0')
  })
})

// ===========================================================================
// TIMEZONE — ADR-008. The whole point of the explicit conversion.
// ===========================================================================
describe('timezone — Asia/Ho_Chi_Minh, and not because this machine is in Vietnam', () => {
  it('🔑 an event at 22:00 UTC belongs to the NEXT VN day', async () => {
    // 2026-08-01T22:00Z is 2026-08-02 05:00 in Vietnam. Under a bare cast (or a
    // UTC server) this lands on 08-01 and fails D1 for the 08-01 cohort. It is
    // the single case that separates a correct conversion from an absent one.
    await profile(U1, '2026-08-01')
    await event(U1, '2026-08-01T22:00:00Z')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(1)
  })

  it('🔑 a registration at 22:00 UTC belongs to the NEXT VN cohort', async () => {
    // The same trap on the other side of the join. The helper seeds 09:00 VN
    // (= 02:00 UTC), the one time of day both calendars agree — so registration
    // bucketing needs its own case or it is never actually exercised.
    await db.query(`INSERT INTO profiles (id, created_at) VALUES ($1, '2026-08-01T22:00:00Z'::timestamptz)`, [U1])
    await rollup('2026-08-01', '2026-08-02', '2026-09-15')
    expect((await cohort('2026-08-01')).cohort_size).toBe(0)
    expect((await cohort('2026-08-02')).cohort_size).toBe(1)
  })

  it('🔑 the cohort PRE-FILTER buckets in VN too, or a boundary registration vanishes', async () => {
    // 2026-08-01T18:00Z is 2026-08-02 01:00 in Vietnam. Its VN cohort date is
    // 08-02; its UTC date is 08-01. Asking for the 08-02 cohort ALONE, a
    // pre-filter that bucketed in UTC would exclude this profile before the
    // (correctly converted) SELECT ever saw it — cohort_size 0 instead of 1,
    // silently, for every user who registered late in the VN evening.
    //
    // Mutation R03 survived without this case: the earlier tests all use a
    // window wide enough that the UTC and VN dates both fall inside it, so only
    // the SELECT's conversion was ever exercised.
    await db.query(`INSERT INTO profiles (id, created_at) VALUES ($1, '2026-08-01T18:00:00Z'::timestamptz)`, [U1])
    await rollup('2026-08-02', '2026-08-02', '2026-09-15')
    expect((await cohort('2026-08-02')).cohort_size).toBe(1)
  })

  it('and the same filter must not pull in a registration that is NOT in the window', async () => {
    // The other direction, so the fix cannot be "widen the filter until it
    // passes": 2026-08-02T18:00Z is 08-03 in Vietnam and must NOT appear in the
    // 08-02 cohort.
    await db.query(`INSERT INTO profiles (id, created_at) VALUES ($1, '2026-08-02T18:00:00Z'::timestamptz)`, [U2])
    await rollup('2026-08-02', '2026-08-02', '2026-09-15')
    expect((await cohort('2026-08-02')).cohort_size).toBe(0)
  })

  it('an event at 16:59 UTC still belongs to the SAME VN day', async () => {
    // 16:59Z = 23:59 VN. The boundary is 17:00Z exactly; one minute earlier
    // must not roll over, or the conversion is off by an hour somewhere.
    await profile(U1, '2026-08-01')
    await event(U1, '2026-08-02T16:59:00Z')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(1)
  })

  it('an event at 17:00 UTC has already rolled over', async () => {
    await profile(U1, '2026-08-01')
    await event(U1, '2026-08-02T17:00:00Z') // = 2026-08-03 00:00 VN
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(0)
  })

  it('the first and last instants of a VN day both land on it', async () => {
    await profile(U1, '2026-08-01')
    await profile(U2, '2026-08-01')
    await event(U1, '2026-08-02T00:00:00+07:00')
    await event(U2, '2026-08-02T23:59:59+07:00')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(2)
  })
})

// ===========================================================================
// PIPELINE — deterministic, idempotent, reconciling.
// ===========================================================================
describe('the rollup is idempotent and reconciles', () => {
  it('running twice produces the same row, not two rows', async () => {
    await profile(U1, '2026-08-01')
    await eventOnVnDay(U1, '2026-08-02')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    const r = await one<{ n: string }>(`SELECT count(*) n FROM cohort_metrics WHERE cohort_date='2026-08-01'`)
    expect(r.n).toBe('1')
    expect((await cohort('2026-08-01')).d1_retained).toBe(1)
  })

  it('🔑 a LATE-ARRIVING event is picked up by a re-run — recompute, never increment', async () => {
    await profile(U1, '2026-08-01')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(0)

    await eventOnVnDay(U1, '2026-08-02')       // arrives after the first run
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(1)
  })

  it('a REMOVED event is reflected too — the row mirrors the source, it does not accumulate', async () => {
    await profile(U1, '2026-08-01')
    await eventOnVnDay(U1, '2026-08-02')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    await db.query(`DELETE FROM user_events`)
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect((await cohort('2026-08-01')).d1_retained).toBe(0)
  })

  it('computed_at advances on recompute, so staleness is visible', async () => {
    await profile(U1, '2026-08-01')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    const first = (await cohort('2026-08-01')).computed_at
    await db.query(`SELECT pg_sleep(0.05)`)
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    expect(new Date((await cohort('2026-08-01')).computed_at).getTime())
      .toBeGreaterThan(new Date(first).getTime())
  })

  it('a window covers every cohort day in it, inclusive of both ends', async () => {
    await profile(U1, '2026-08-01')
    await profile(U2, '2026-08-02')
    await profile(U3, '2026-08-03')
    await rollup('2026-08-01', '2026-08-03', '2026-09-15')
    const r = await one<{ n: string }>(`SELECT count(*) n FROM cohort_metrics`)
    expect(r.n).toBe('3')
  })

  it('an inverted window writes nothing rather than guessing', async () => {
    await profile(U1, '2026-08-01')
    await rollup('2026-08-03', '2026-08-01', '2026-09-15')
    const r = await one<{ n: string }>(`SELECT count(*) n FROM cohort_metrics`)
    expect(r.n).toBe('0')
  })

  it('cohorts outside the window are left alone', async () => {
    await profile(U1, '2026-08-01')
    await profile(U2, '2026-08-05')
    await rollup('2026-08-01', '2026-08-01', '2026-09-15')
    await rollup('2026-08-05', '2026-08-05', '2026-09-15')
    // Recomputing only 08-05 must not disturb 08-01.
    await db.query(`UPDATE cohort_metrics SET cohort_size = 999 WHERE cohort_date='2026-08-01'`)
    await rollup('2026-08-05', '2026-08-05', '2026-09-15')
    expect((await cohort('2026-08-01')).cohort_size).toBe(999)
  })

  it('a cohort in the FUTURE relative to today is still written, with no measurable rates', async () => {
    await profile(U4, '2026-08-10')
    await rollup('2026-08-10', '2026-08-10', '2026-08-10')
    const c = await cohort('2026-08-10')
    expect(c.cohort_size).toBe(1)
    expect([c.d1_rate, c.d7_rate, c.d30_rate]).toEqual([null, null, null])
  })
})
