-- ============================================================================
-- Controller V2 - Module 04 User Analytics, RETENTION: `cohort_metrics`
--
-- GATE: NOT YET AUTHORIZED FOR PRODUCTION. Module 01's `daily_snapshots`
--       authorization (2026-08-20) covered that table and nothing else. This
--       is a SEPARATE production mutation and needs its own explicit Owner
--       authorization, its own preflight and its own rollback window
--       (ADR-017 pattern).
--
-- CONTRACT
--   04_Database_Architecture.md §3.3  the authoritative DDL, reproduced below
--                                     VERBATIM. (§7 is "Existing Table
--                                     Modifications" and does not define it.)
--   25_KPI_Definitions.md §4          "classic (bracket) retention" for
--                                     D1/D7/D30 - active on EXACTLY that day.
--   06_Analytics_Architecture.md §6   the rollup: find cohorts at a milestone,
--                                     count who was active, UPSERT.
--   ADR-008                           the reporting day is Asia/Ho_Chi_Minh.
--
-- ---------------------------------------------------------------------------
-- FOUR PLACES WHERE THE DOCUMENTS AND THE DATABASE DISAGREE
--
-- Each is resolved from the authoritative source and recorded here, because a
-- resolution nobody can find is indistinguishable from an oversight.
--
-- 1. `04` §7A and `06` §8C both say retention derives from `user_active_days`.
--    THAT TABLE DOES NOT EXIST. §8C itself frames it as a PERFORMANCE
--    structure - "all active-user and retention queries become index scans
--    over a small table", trade-off "one extra derived table to maintain" -
--    holding the same facts the event stream already holds. So retention
--    derives from `user_events`, which is exactly what M01's in-production
--    `fn_rollup_daily_snapshots` does for DAU/WAU/MAU. Same source, same
--    numbers, no new table. If `user_active_days` is ever built, it replaces
--    the `activity` CTE below and no result changes.
--
-- 2. `06` §6 specifies a SEPARATE `cohort-rollup` cron at 00:10 UTC. That is
--    07:10 VN - seven hours INTO the Vietnamese day it would be measuring, so
--    every "active today" count would be a partial day that changes by
--    evening. This function is called from `analytics-snapshot` at 00:05 VN
--    instead, which runs just after a VN day CLOSES. That is what ADR-008 is
--    for, and it adds no second cron.
--
-- 3. §3.3 gives the rate columns `DEFAULT 0`. A rate of 0 for a cohort of zero
--    users is precisely the false `0%` Module 04 exists to refuse. The columns
--    are NULLABLE, so the DDL already permits the honest value; the rollup
--    always writes an explicit one, so the DEFAULT is never reached. The DDL
--    is therefore kept VERBATIM rather than "corrected".
--
-- 4. COUNTS are NOT NULL; RATES are nullable. That asymmetry is the whole
--    design. A count is a fact about what was observed. A rate is a CLAIM
--    about a cohort, and it can only be made when the cohort is non-empty AND
--    the milestone day has closed.
-- ---------------------------------------------------------------------------
--
-- IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK:   supabase/migrations/rollback/20260820_m04_cohort_metrics_rollback.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The fact table - `04` §3.3, unchanged.
--
--    `platform` keeps its §3.3 default of 'all' and stays in the unique key
--    even though the rollup writes only 'all' rows today, for the same reason
--    `daily_snapshots` does: a per-platform breakdown then arrives as a
--    pipeline change rather than a schema migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- DATE, never TIMESTAMPTZ: a calendar day already has its timezone resolved
  -- (ADR-008). Storing an instant would reintroduce the ambiguity the day
  -- bucketing exists to remove.
  cohort_date     DATE NOT NULL,          -- Registration date of cohort
  platform        TEXT NOT NULL DEFAULT 'all',
  cohort_size     INTEGER NOT NULL DEFAULT 0,
  d1_retained     INTEGER NOT NULL DEFAULT 0,
  d7_retained     INTEGER NOT NULL DEFAULT 0,
  d30_retained    INTEGER NOT NULL DEFAULT 0,
  d1_rate         NUMERIC(5,4) DEFAULT 0, -- 0.00-1.00; NULL = not measurable
  d7_rate         NUMERIC(5,4) DEFAULT 0,
  d30_rate        NUMERIC(5,4) DEFAULT 0,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (cohort_date, platform)
);

CREATE INDEX IF NOT EXISTS idx_cohort_metrics_date ON public.cohort_metrics(cohort_date DESC);

-- ---------------------------------------------------------------------------
-- 2. The access boundary (ADR-019).
--
--    A new table in this schema is BORN fully open: `pg_default_acl` grants
--    anon and authenticated everything. Without these REVOKEs the retention of
--    every cohort is one anonymous PostgREST GET away.
--
--    `service_role` keeps access: it is the API tier's identity, and the
--    Controller reads this table through the admin client behind the PDP.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.cohort_metrics FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.cohort_metrics TO service_role;

ALTER TABLE public.cohort_metrics ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately (04 §8): with RLS on, a missing policy is a
-- denial, and `service_role` reaches the table by BYPASSRLS rather than policy.

-- ---------------------------------------------------------------------------
-- 3. The aggregation.
--
--    RECOMPUTE-AND-OVERWRITE over a window of COHORT DATES, exactly like
--    `fn_rollup_daily_snapshots` (SR-4: the aggregation lives ONCE, in SQL).
--    That makes it idempotent AND makes it reconcile late-arriving events: a
--    re-run replaces the row rather than adding to it.
--
--    A row is written for EVERY cohort day in the window, including days with
--    no registrations. An absent row and an empty cohort are different facts.
--
--    `p_today` IS A PARAMETER, NOT `now()`. A milestone is measurable only
--    once its day has CLOSED, and a function that decides that from the server
--    clock cannot be tested for it - the assertion would depend on when the
--    suite happened to run. Passing the VN calendar day in makes the rule
--    explicit and the tests deterministic.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rollup_cohort_metrics(p_from DATE, p_to DATE, p_today DATE)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH days AS (
    -- An inverted window yields zero rows, so nothing is written. Guessing at
    -- the caller's intent would write cohorts nobody asked for.
    SELECT d::date AS cohort_date FROM generate_series(p_from, p_to, interval '1 day') AS d
  ),
  -- Cohort membership: the VN calendar day of REGISTRATION (§3.3).
  signup AS (
    SELECT p.id AS user_id,
           (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS cohort_date
    FROM public.profiles p
    WHERE (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p_from AND p_to
  ),
  -- Activity, NOT de-duplicated here: the single dedup point is the
  -- `count(DISTINCT ...)` below. Two of them would let either one be deleted
  -- without any test noticing.
  --
  -- Anonymous events carry no user_id and are excluded: they cannot belong to
  -- a registration cohort.
  --
  -- The window spans the earliest milestone any cohort in range can have
  -- (p_from + 1) to the latest (p_to + 30). Narrowing it silently drops D30.
  activity AS (
    SELECT e.user_id,
           (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS active_date
    FROM public.user_events e
    WHERE e.user_id IS NOT NULL
      AND (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            BETWEEN (p_from + 1) AND (p_to + 30)
  ),
  -- CLASSIC (BRACKET) retention, `25` §4: active on EXACTLY day C+N. Rolling
  -- retention ("any day >= C+N") is a separate secondary view and is NOT this
  -- table; conflating them silently inflates every number on the page.
  computed AS (
    SELECT
      d.cohort_date,
      (SELECT count(*) FROM signup s WHERE s.cohort_date = d.cohort_date)::int AS cohort_size,
      (SELECT count(DISTINCT a.user_id) FROM activity a
         JOIN signup s ON s.user_id = a.user_id
        WHERE s.cohort_date = d.cohort_date AND a.active_date = d.cohort_date + 1)::int  AS d1,
      (SELECT count(DISTINCT a.user_id) FROM activity a
         JOIN signup s ON s.user_id = a.user_id
        WHERE s.cohort_date = d.cohort_date AND a.active_date = d.cohort_date + 7)::int  AS d7,
      (SELECT count(DISTINCT a.user_id) FROM activity a
         JOIN signup s ON s.user_id = a.user_id
        WHERE s.cohort_date = d.cohort_date AND a.active_date = d.cohort_date + 30)::int AS d30
    FROM days d
  )
  INSERT INTO public.cohort_metrics AS c (
    cohort_date, platform, cohort_size,
    d1_retained, d7_retained, d30_retained,
    d1_rate, d7_rate, d30_rate, computed_at
  )
  SELECT
    k.cohort_date, 'all', k.cohort_size,
    k.d1, k.d7, k.d30,
    -- A rate needs BOTH: somebody to divide by, and a day that has finished.
    -- `cohort_date + N < p_today` is the closed-day test - on the morning of
    -- day D the last complete VN day is D-1.
    CASE WHEN k.cohort_size > 0 AND (k.cohort_date + 1)  < p_today
         THEN round(k.d1::numeric  / k.cohort_size, 4) END,
    CASE WHEN k.cohort_size > 0 AND (k.cohort_date + 7)  < p_today
         THEN round(k.d7::numeric  / k.cohort_size, 4) END,
    CASE WHEN k.cohort_size > 0 AND (k.cohort_date + 30) < p_today
         THEN round(k.d30::numeric / k.cohort_size, 4) END,
    now()
  FROM computed k
  ON CONFLICT (cohort_date, platform) DO UPDATE SET
    cohort_size  = EXCLUDED.cohort_size,
    d1_retained  = EXCLUDED.d1_retained,
    d7_retained  = EXCLUDED.d7_retained,
    d30_retained = EXCLUDED.d30_retained,
    d1_rate      = EXCLUDED.d1_rate,
    d7_rate      = EXCLUDED.d7_rate,
    d30_rate     = EXCLUDED.d30_rate,
    computed_at  = EXCLUDED.computed_at;
$$;

-- Same boundary as the table: a rollup anyone can call is a rollup anyone can
-- use to rewrite the numbers.
REVOKE EXECUTE ON FUNCTION public.fn_rollup_cohort_metrics(DATE, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_rollup_cohort_metrics(DATE, DATE, DATE) TO service_role;

-- ============================================================================
-- VERIFICATION (run after apply; read-only)
--
--   -- grants: expect service_role only
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name='cohort_metrics';
--
--   -- RLS on, zero policies
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.cohort_metrics'::regclass;
--   SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='cohort_metrics';
--
--   -- the table starts EMPTY; the first rows arrive from the 00:05 VN cron
--   SELECT count(*) FROM public.cohort_metrics;
--
--   -- shape
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.cohort_metrics'::regclass AND contype='u';
--   SELECT indexname FROM pg_indexes WHERE tablename='cohort_metrics';
--
--   -- credential-free existence probe (memory: PGRST205 -> 42501 is the proof)
--   --   before: PGRST205 (absent)   after: 42501 (present, denied)
-- ============================================================================
