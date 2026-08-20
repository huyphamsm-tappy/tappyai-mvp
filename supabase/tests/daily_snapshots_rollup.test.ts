import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// Controller V2 - Module 01 Home Dashboard: `daily_snapshots` + its rollup.
//
// CONTRACT
//   04_Database_Architecture.md §7   the table, grain VN day x platform,
//                                    UNIQUE (snapshot_date, platform)
//   04 §7A                           `is_final` / `reconciled_at` - provisional
//                                    rows become final once the window closes
//   03_Module_Architecture.md M01    "Data from daily_snapshots (pre-computed)
//                                    - no live queries to raw tables"
//   ADR-008                          the reporting day is Asia/Ho_Chi_Minh
//
// WHY ONLY SIX METRIC COLUMNS
// §7 defines 34. Six have a real source in this database today; the rest name
// tables that do not exist (`ai_usage_log`, `conversations`, `moderation_queue`,
// notification delivery) or data this platform does not hold. A column that can
// only ever contain its DEFAULT is worse than an absent one, because a
// dashboard renders `0` as a measurement. The omitted columns stay additive:
// the module that owns each source adds its own when it ships.
//
// SCOPE. Schema, access boundary, and the aggregation's semantics against a
// real PostgreSQL. The API and the page are covered by their own suites.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260820_m01_daily_snapshots.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

const PORT = 54359
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const U3 = '33333333-3333-4333-8333-333333333333'

/** The production baseline this migration lands on. */
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- The platform fact: a new table AND a new function in this schema are BORN
  -- fully open. Without BOTH lines every REVOKE assertion passes vacuously
  -- (ADR-019). The FUNCTIONS half is the one B8's harness was missing.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- user_events as production carries it: the base table plus the analytics
  -- envelope columns added by 20260713_analytics_envelope_foundation.sql.
  CREATE TABLE public.user_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, event_type TEXT NOT NULL, metadata JSONB DEFAULT '{}',
    anon_id UUID, platform TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Control object: same open defaults, never revoked.
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

/** Seed one profile whose VN creation day is `vnDate`. */
const profile = (id: string, vnDate: string) =>
  db.query(`INSERT INTO profiles (id, created_at) VALUES ($1, $2::timestamptz)`, [
    id,
    `${vnDate}T09:00:00+07:00`,
  ])

/** Seed one activity event at a given absolute instant. */
const event = (userId: string, atIso: string, type = 'page_view', platform = 'web') =>
  db.query(
    `INSERT INTO user_events (user_id, event_type, platform, created_at) VALUES ($1,$2,$3,$4::timestamptz)`,
    [userId, type, platform, atIso]
  )

/** Recompute a window. Deliberately does NOT finalise — see `runWindow`. */
const rollup = (from: string, to: string) =>
  db.query(`SELECT fn_rollup_daily_snapshots($1::date, $2::date)`, [from, to])

/**
 * What the cron does: recompute the window, then close every day that has
 * fallen out of it. Two functions, not one, so a failure in either is visible
 * rather than swallowed — the tests exercise that same contract.
 */
async function runWindow(from: string, to: string) {
  await rollup(from, to)
  await db.query(`SELECT fn_finalize_daily_snapshots($1::date)`, [from])
}

const snapshot = (date: string) =>
  one<{
    dau: number; wau: number; mau: number
    new_users: number; returning_users: number; total_users: number
    is_final: boolean; reconciled_at: string | null
  }>(`SELECT * FROM daily_snapshots WHERE snapshot_date = $1 AND platform = 'all'`, [date])

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-m01-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()

  // ⚠️ PIN THE SESSION TIMEZONE TO UTC, AND NOT AS TIDINESS.
  //
  // `(timestamptz)::date` casts using the SESSION TimeZone. This machine is in
  // Vietnam, so PostgreSQL inherited `Asia/Ho_Chi_Minh` — which made a UTC cast
  // and an explicit `AT TIME ZONE 'Asia/Ho_Chi_Minh'` produce identical results,
  // and every timezone assertion below passed for an environment-dependent
  // reason. Mutation S4/S5 (dropping the explicit conversion) SURVIVED because
  // of it; on a UTC CI runner the same code would have bucketed differently.
  //
  // Forcing UTC makes the explicit conversion the ONLY thing that can produce a
  // VN calendar day, which is what these tests are actually about.
  await db.query(`SET TimeZone = 'UTC'`)

  await db.query(PRELUDE)
  await db.query(MIGRATION)
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DELETE FROM daily_snapshots')
  await db.query('DELETE FROM user_events')
  await db.query('DELETE FROM profiles')
})

// ---------------------------------------------------------------------------

describe('schema - 04 §7 and §7A', () => {
  it('carries exactly the columns with a real source, and no others', async () => {
    const { rows } = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='daily_snapshots'
       ORDER BY column_name
    `)
    // Any addition here must arrive with the source that populates it.
    expect(rows.map((r) => r.column_name)).toEqual([
      'created_at', 'dau', 'id', 'is_final', 'mau', 'new_users', 'platform',
      'reconciled_at', 'returning_users', 'snapshot_date', 'total_users',
      'updated_at', 'wau',
    ])
  })

  it('has no column for a metric with no source table', async () => {
    // Named individually: these are the §7 columns most likely to be added back
    // "for completeness", and each would render a default as a measurement.
    const { rows } = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='daily_snapshots'
         AND column_name IN ('ai_cost_usd','ai_conversations','mrr_usd','revenue_day_usd',
                             'notifs_sent','review_views','total_sessions','churned_users')
    `)
    expect(rows).toEqual([])
  })

  it('is keyed on the VN day and platform, per §7', async () => {
    const row = await one<{ def: string }>(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid='public.daily_snapshots'::regclass AND contype='u'
    `)
    expect(row.def).toContain('snapshot_date')
    expect(row.def).toContain('platform')
  })

  it('snapshot_date is a DATE, not a timestamp', async () => {
    // A timestamp column would silently reintroduce a timezone into a value
    // that is defined as a calendar day (ADR-008).
    const row = await one<{ data_type: string }>(`
      SELECT data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='daily_snapshots' AND column_name='snapshot_date'
    `)
    expect(row.data_type).toBe('date')
  })

  it('carries the §7 indexes', async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename='daily_snapshots' ORDER BY indexname`
    )
    const names = rows.map((r) => r.indexname)
    expect(names).toContain('idx_daily_snapshots_date')
    expect(names).toContain('idx_daily_snapshots_platform')
  })
})

describe('access boundary - the dashboard is not a data-leak surface', () => {
  it.each(['anon', 'authenticated'])('%s cannot read the table', async (role) => {
    expect(await asRole(role, `SELECT * FROM daily_snapshots`)).toBe('42501')
  })

  it.each(['anon', 'authenticated'])('%s cannot write to it', async (role) => {
    expect(
      await asRole(role, `INSERT INTO daily_snapshots (snapshot_date) VALUES ('2026-08-01')`)
    ).toBe('42501')
  })

  it('service_role can read it - the API tier reads through the admin client', async () => {
    expect(await asRole('service_role', `SELECT * FROM daily_snapshots`)).toBeNull()
  })

  it('the harness control table IS open, proving the defaults were in force', async () => {
    const { rows } = await db.query(`
      SELECT 1 FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name='harness_control' AND grantee='anon' LIMIT 1
    `)
    expect(rows).toHaveLength(1)
  })

  it('RLS is enabled with zero policies - deny by default (04 §8)', async () => {
    const row = await one<{ rls: boolean; policies: string }>(`
      SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.daily_snapshots'::regclass) AS rls,
             (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='daily_snapshots') AS policies
    `)
    expect(row.rls).toBe(true)
    expect(Number(row.policies)).toBe(0)
  })

  it.each(['anon', 'authenticated'])('%s cannot run the rollup function', async (role) => {
    expect(await asRole(role, `SELECT fn_rollup_daily_snapshots('2026-08-01','2026-08-01')`)).toBe('42501')
  })

  it('service_role CAN run it - it is the cron identity', async () => {
    expect(await asRole('service_role', `SELECT fn_rollup_daily_snapshots('2026-08-01','2026-08-01')`)).toBeNull()
  })
})

describe('the VN calendar day is the grain - ADR-008', () => {
  it('an event at 23:30 UTC belongs to the NEXT VN day', async () => {
    // 2026-08-10T23:30Z is 2026-08-11T06:30 in Asia/Ho_Chi_Minh. Bucketing by
    // UTC would put this activity on the wrong day, which is the single most
    // likely way a daily metric goes quietly wrong.
    await profile(U1, '2026-08-01')
    await event(U1, '2026-08-10T23:30:00Z')
    await rollup('2026-08-09', '2026-08-12')

    expect((await snapshot('2026-08-11')).dau).toBe(1)
    const prior = await db.query(`SELECT dau FROM daily_snapshots WHERE snapshot_date='2026-08-10'`)
    expect((prior.rows[0] as { dau: number } | undefined)?.dau ?? 0).toBe(0)
  })

  it('a SIGNUP at 22:00 UTC counts as the NEXT VN day', async () => {
    // The signup bucketing has its own conversion, and its own way to be wrong.
    // Mutation S5 (dropping AT TIME ZONE on `profiles.created_at`) survived
    // until this case existed: the helper seeded profiles at 09:00 VN, which is
    // 02:00 UTC — the same calendar date either way, so the bug was invisible.
    // 2026-08-09T22:00Z is 2026-08-10T05:00 in Asia/Ho_Chi_Minh.
    await profile(U1, '2026-08-01')
    await db.query(`INSERT INTO profiles (id, created_at) VALUES ($1, '2026-08-09T22:00:00Z')`, [U2])
    await rollup('2026-08-09', '2026-08-11')

    expect((await snapshot('2026-08-10')).new_users).toBe(1)
    expect((await snapshot('2026-08-09')).new_users).toBe(0)
    // And the cumulative count follows the same day boundary.
    expect((await snapshot('2026-08-09')).total_users).toBe(1) // U1, seeded on 08-01
    expect((await snapshot('2026-08-10')).total_users).toBe(2)
  })

  it('an event at 16:59 UTC still belongs to the SAME VN day', async () => {
    await profile(U1, '2026-08-01')
    await event(U1, '2026-08-10T16:59:00Z')
    await rollup('2026-08-09', '2026-08-12')
    expect((await snapshot('2026-08-10')).dau).toBe(1)
  })
})

describe('the metrics', () => {
  beforeEach(async () => {
    await profile(U1, '2026-08-01')
    await profile(U2, '2026-08-10')
    await profile(U3, '2026-08-20')
  })

  it('dau counts DISTINCT users, not events', async () => {
    await event(U1, '2026-08-10T03:00:00Z')
    await event(U1, '2026-08-10T04:00:00Z')
    await event(U2, '2026-08-10T05:00:00Z')
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).dau).toBe(2)
  })

  it('new_users counts profiles created that VN day', async () => {
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).new_users).toBe(1)
  })

  it('total_users is cumulative through that day, not just that day', async () => {
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).total_users).toBe(2)
  })

  it('returning_users excludes accounts created that same day', async () => {
    // U2 signed up on the 10th and was active on the 10th - active, but not
    // returning. U1 predates the day, so U1 is the only returning user.
    await event(U1, '2026-08-10T03:00:00Z')
    await event(U2, '2026-08-10T03:00:00Z')
    await rollup('2026-08-10', '2026-08-10')
    const s = await snapshot('2026-08-10')
    expect(s.dau).toBe(2)
    expect(s.returning_users).toBe(1)
  })

  it('wau is the trailing 7 VN days INCLUDING the snapshot day', async () => {
    await event(U1, '2026-08-04T03:00:00Z') // day -6, inside
    await event(U2, '2026-08-10T03:00:00Z') // the day itself
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).wau).toBe(2)
  })

  it('wau excludes a user last active 7 days before', async () => {
    await event(U1, '2026-08-03T03:00:00Z') // day -7, outside the 7-day window
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).wau).toBe(0)
  })

  it('mau is the trailing 30 VN days', async () => {
    await event(U1, '2026-07-13T03:00:00Z') // day -28, inside
    await event(U2, '2026-06-20T03:00:00Z') // far outside
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).mau).toBe(1)
  })

  it('a day with no activity is still written, as zero', async () => {
    // An absent row and a zero day are different facts. The dashboard must be
    // able to tell "nobody was active" from "the pipeline did not run".
    await rollup('2026-08-15', '2026-08-15')
    const s = await snapshot('2026-08-15')
    expect(s.dau).toBe(0)
    expect(s.total_users).toBe(2)
  })
})

describe('idempotency and reconciliation', () => {
  beforeEach(async () => {
    await profile(U1, '2026-08-01')
  })

  it('running twice produces ONE row with the same values', async () => {
    await event(U1, '2026-08-10T03:00:00Z')
    await rollup('2026-08-10', '2026-08-10')
    const first = await snapshot('2026-08-10')
    await rollup('2026-08-10', '2026-08-10')
    const second = await snapshot('2026-08-10')

    const count = await one<{ c: string }>(
      `SELECT count(*) c FROM daily_snapshots WHERE snapshot_date='2026-08-10'`
    )
    expect(Number(count.c)).toBe(1)
    expect(second.dau).toBe(first.dau)
  })

  it('a LATE event is picked up by a re-run - recompute, not accumulate', async () => {
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).dau).toBe(0)

    await event(U1, '2026-08-10T03:00:00Z')
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).dau).toBe(1)
  })

  it('a re-run does not double-count - the window is recomputed, never summed', async () => {
    await event(U1, '2026-08-10T03:00:00Z')
    await rollup('2026-08-10', '2026-08-10')
    await rollup('2026-08-10', '2026-08-10')
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).dau).toBe(1)
  })

  it('rows inside the window are PROVISIONAL - §7A', async () => {
    await rollup('2026-08-10', '2026-08-12')
    const s = await snapshot('2026-08-11')
    expect(s.is_final).toBe(false)
    expect(s.reconciled_at).toBeNull()
  })

  it('the rollup ALONE never finalises — closing is a separate, visible step', async () => {
    // If recompute silently finalised, a partial cron run could close days it
    // had not actually reconciled.
    await rollup('2026-08-10', '2026-08-12')
    await rollup('2026-08-13', '2026-08-15')
    expect((await snapshot('2026-08-11')).is_final).toBe(false)
  })

  it('a day that drops OUT of the window becomes final, with a timestamp', async () => {
    // §7A: "sets is_final=true once the window closes."
    await runWindow('2026-08-10', '2026-08-12')
    await runWindow('2026-08-13', '2026-08-15')
    const s = await snapshot('2026-08-11')
    expect(s.is_final).toBe(true)
    expect(s.reconciled_at).not.toBeNull()
  })

  it('a day still INSIDE the window is not closed by finalisation', async () => {
    await runWindow('2026-08-10', '2026-08-12')
    expect((await snapshot('2026-08-12')).is_final).toBe(false)
  })

  it('a finalised day is NOT recomputed by a later window', async () => {
    await event(U1, '2026-08-10T03:00:00Z')
    await runWindow('2026-08-10', '2026-08-10')
    await runWindow('2026-08-14', '2026-08-16') // closes the 10th
    expect((await snapshot('2026-08-10')).is_final).toBe(true)
    expect((await snapshot('2026-08-10')).dau).toBe(1)

    // A very late event arrives for a closed day. Recomputing it would silently
    // change a number an operator may already have reported.
    await event(U2, '2026-08-10T04:00:00Z')
    await runWindow('2026-08-08', '2026-08-11') // the 10th is back in range
    const s = await snapshot('2026-08-10')
    expect(s.is_final).toBe(true)
    expect(s.dau).toBe(1) // unchanged — the closed day is immutable
  })

  it('leaves rows OUTSIDE the window alone', async () => {
    await rollup('2026-08-01', '2026-08-01')
    const before = await snapshot('2026-08-01')
    await rollup('2026-08-10', '2026-08-12')
    const after = await snapshot('2026-08-01')
    expect(after.total_users).toBe(before.total_users)
  })

  it('anonymous events do not create a user - they are excluded from DAU', async () => {
    await db.query(
      `INSERT INTO user_events (user_id, event_type, created_at) VALUES (NULL,'page_view','2026-08-10T03:00:00Z')`
    )
    await rollup('2026-08-10', '2026-08-10')
    expect((await snapshot('2026-08-10')).dau).toBe(0)
  })
})

describe('the migration file', () => {
  it('is idempotent - applying it twice raises nothing', async () => {
    await expect(db.query(MIGRATION)).resolves.toBeDefined()
  })

  it('never grants the table to a PostgREST client role', async () => {
    expect(MIGRATION).not.toMatch(/GRANT[^;]*\bON\s+TABLE\s+public\.daily_snapshots[^;]*\b(anon|authenticated)\b/i)
  })

  it('the session timezone really is UTC, so the timezone tests mean something', async () => {
    // If this ever reverts to the machine's local zone, the VN-day assertions
    // start passing for the wrong reason — which is exactly what happened once.
    const row = await one<{ TimeZone: string }>(`SHOW TimeZone`)
    expect(row.TimeZone).toBe('UTC')
  })

  it('the activity pre-filter is at least as wide as the widest window', () => {
    // The rollup pre-filters `activity` to a look-back before computing MAU. If
    // the MAU window is widened without widening the pre-filter, MAU silently
    // UNDER-counts and no behavioural test can see it — the pre-filter removes
    // the rows before the window ever looks. Mutation S12 proved exactly that.
    // This pins the two numbers to each other.
    const prefilter = MIGRATION.match(/p_from - INTERVAL '(\d+) days'/)
    const mauWindow = MIGRATION.match(/d\.snapshot_date - (\d+)\) AND d\.snapshot_date\),\s*[\r\n]+\s*false/)
    expect(prefilter?.[1], 'activity pre-filter look-back not found').toBeDefined()
    expect(mauWindow?.[1], 'MAU window not found').toBeDefined()
    expect(Number(prefilter![1])).toBeGreaterThanOrEqual(Number(mauWindow![1]))
  })
})
