-- ============================================================================
-- Controller V2 - Module 01 Home Dashboard: `daily_snapshots` + its rollup
--
-- GATE: applied to production ONLY under explicit Owner authorization, as its
--       own change with its own preflight, verification and rollback window
--       (ADR-017 pattern). Owner authorized THIS migration on 2026-08-20; that
--       authorization covers `daily_snapshots` and nothing else.
--
-- CONTRACT
--   04_Database_Architecture.md §7    the table, grain VN day x platform,
--                                     UNIQUE (snapshot_date, platform)
--   04 §7A                            is_final / reconciled_at - provisional
--                                     rows become final once the window closes
--   03_Module_Architecture.md M01     "Data from daily_snapshots (pre-computed)
--                                     - no live queries to raw tables"
--   ADR-008                           the reporting day is Asia/Ho_Chi_Minh
--
-- ---------------------------------------------------------------------------
-- WHY SIX METRIC COLUMNS AND NOT THIRTY-FOUR
--
-- §7 defines 34 metric columns. SIX of them have a real source in this database
-- today. The rest name tables that do not exist - `ai_usage_log`,
-- `conversations`, `moderation_queue`, notification delivery, Stripe revenue -
-- or data the platform does not hold.
--
-- A column that can only ever contain its DEFAULT is worse than an absent one,
-- because a dashboard renders `0` as a measurement. "Revenue today: $0" is a
-- statement of fact that would be false; an absent metric is honest.
--
-- The omitted columns stay ADDITIVE. §7 is not amended and nothing here
-- contradicts it: the module that owns each source adds its own column when it
-- ships (AI cost -> Module 15, revenue -> Commerce, content -> Module 02). That
-- is the same "only additions, never breaking changes" rule §7 states itself.
--
-- MEASURED, so the choice is checkable rather than asserted:
--   present  -> user_events, profiles, auth_daily_rollup, activation_daily_rollup,
--               user_acquisition, subscriptions, system_health_log, reviews
--   absent   -> ai_usage_log, conversations, moderation_queue, track_events,
--               user_active_days, notification_campaigns
-- ---------------------------------------------------------------------------
--
-- IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK:   supabase/migrations/rollback/20260820_m01_daily_snapshots_rollback.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The fact table. Grain: VN calendar day x platform.
--
--    `platform` is kept with its §7 default of 'all' and stays in the unique
--    key even though the rollup writes only 'all' rows today. Per-platform
--    breakdown belongs to Module 04 User Analytics; keeping the column means
--    that arrives as a pipeline change, not a schema migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- DATE, never TIMESTAMPTZ: a calendar day already has its timezone resolved
  -- (ADR-008). Storing an instant would reintroduce the ambiguity the day
  -- bucketing exists to remove.
  snapshot_date   DATE NOT NULL,
  platform        TEXT NOT NULL DEFAULT 'all',

  -- User growth
  total_users     INTEGER NOT NULL DEFAULT 0,   -- cumulative through the day
  new_users       INTEGER NOT NULL DEFAULT 0,   -- profiles created that VN day
  returning_users INTEGER NOT NULL DEFAULT 0,   -- active, and not created that day

  -- Active usage
  dau             INTEGER NOT NULL DEFAULT 0,
  wau             INTEGER NOT NULL DEFAULT 0,   -- trailing 7 VN days, inclusive
  mau             INTEGER NOT NULL DEFAULT 0,   -- trailing 30 VN days, inclusive

  -- 04 §7A integrity fields.
  is_final        BOOLEAN NOT NULL DEFAULT false,
  reconciled_at   TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (snapshot_date, platform)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date
  ON public.daily_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_platform
  ON public.daily_snapshots (platform, snapshot_date DESC);

-- ---------------------------------------------------------------------------
-- 2. Close it. THIS MUST FOLLOW THE CREATE IMMEDIATELY.
--
--    Production `pg_default_acl` for tables in `public` reads
--      anon=arwdDxtm/postgres  authenticated=arwdDxtm/postgres
--    so a new table is BORN fully open (ADR-019, extended to tables). Aggregate
--    business metrics - DAU, user counts, growth - are exactly the numbers a
--    competitor would want, and without this REVOKE they would be one anon-key
--    GET away.
--
--    `service_role` keeps access: it is the API tier's identity, and the
--    Controller reads snapshots through the admin client behind the PDP.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.daily_snapshots FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.daily_snapshots TO service_role;

ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately (04 §8): with RLS on, a missing policy is a
-- denial, and `service_role` reaches the table by BYPASSRLS rather than policy.

-- ---------------------------------------------------------------------------
-- 3. The aggregation.
--
--    RECOMPUTE-AND-OVERWRITE over a window, exactly like `fn_rollup_auth_daily`
--    (SR-4: the aggregation lives ONCE, in SQL, not duplicated in the cron).
--    That makes it idempotent AND makes it reconcile late-arriving events: a
--    re-run replaces the row rather than adding to it.
--
--    A row is written for EVERY day in the window, including days with no
--    activity. An absent row and a zero row are different facts, and the
--    dashboard must be able to tell "nobody was active" from "the pipeline did
--    not run".
--
--    Rows already marked final are NOT recomputed - see section 4.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rollup_daily_snapshots(p_from DATE, p_to DATE)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH days AS (
    SELECT d::date AS snapshot_date FROM generate_series(p_from, p_to, interval '1 day') AS d
  ),
  -- One row per (user, VN day) they were active. Anonymous events carry no
  -- user_id and are excluded: they cannot contribute to a DISTINCT USER count.
  activity AS (
    SELECT DISTINCT
      e.user_id,
      (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS active_date
    FROM public.user_events e
    WHERE e.user_id IS NOT NULL
      AND (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            BETWEEN (p_from - INTERVAL '29 days')::date AND p_to
  ),
  signup AS (
    SELECT p.id AS user_id,
           (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS signup_date
    FROM public.profiles p
  )
  INSERT INTO public.daily_snapshots AS s (
    snapshot_date, platform, total_users, new_users, returning_users, dau, wau, mau, is_final
  )
  SELECT
    d.snapshot_date,
    'all',
    (SELECT count(*) FROM signup g WHERE g.signup_date <= d.snapshot_date),
    (SELECT count(*) FROM signup g WHERE g.signup_date  = d.snapshot_date),
    -- Active that day AND not created that day. An account that signs up and is
    -- immediately active is NEW, not returning; counting it as both would make
    -- the two numbers overlap without saying so.
    (SELECT count(*) FROM activity a
       JOIN signup g ON g.user_id = a.user_id
      WHERE a.active_date = d.snapshot_date AND g.signup_date < d.snapshot_date),
    (SELECT count(*) FROM activity a WHERE a.active_date = d.snapshot_date),
    -- Trailing windows are INCLUSIVE of the snapshot day: 7 days means the day
    -- itself plus the six before it.
    (SELECT count(DISTINCT a.user_id) FROM activity a
      WHERE a.active_date BETWEEN (d.snapshot_date - 6) AND d.snapshot_date),
    (SELECT count(DISTINCT a.user_id) FROM activity a
      WHERE a.active_date BETWEEN (d.snapshot_date - 29) AND d.snapshot_date),
    false
  FROM days d
  ON CONFLICT (snapshot_date, platform) DO UPDATE SET
    total_users     = EXCLUDED.total_users,
    new_users       = EXCLUDED.new_users,
    returning_users = EXCLUDED.returning_users,
    dau             = EXCLUDED.dau,
    wau             = EXCLUDED.wau,
    mau             = EXCLUDED.mau,
    updated_at      = now()
  -- A finalised day is never rewritten. Once a day has left the reconciliation
  -- window an operator may already have reported its numbers; silently changing
  -- them later is worse than carrying a very late event as a known gap.
  WHERE s.is_final = false;
$$;

-- ---------------------------------------------------------------------------
-- 4. Finalisation - 04 §7A.
--
--    "Provisional snapshots are written with is_final=false; ... sets
--    is_final=true once the window closes."
--
--    A day closes when it falls out of the reconciliation window, i.e. when it
--    is older than the window's start. Kept as its own function so the cron
--    expresses the two steps separately and either can fail without the other
--    silently not happening.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_finalize_daily_snapshots(p_before DATE)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.daily_snapshots
     SET is_final = true, reconciled_at = now(), updated_at = now()
   WHERE snapshot_date < p_before
     AND is_final = false;
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges.
--
--    PostgreSQL grants EXECUTE to PUBLIC on a new function by default, and this
--    platform additionally grants functions to the PostgREST roles by default
--    (ADR-019: silence is not "closed"). Both are revoked; `service_role` is
--    granted explicitly because it is the cron's identity.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_rollup_daily_snapshots(DATE, DATE)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_finalize_daily_snapshots(DATE)      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_rollup_daily_snapshots(DATE, DATE)  TO service_role;
GRANT  EXECUTE ON FUNCTION fn_finalize_daily_snapshots(DATE)      TO service_role;

-- ============================================================================
-- VERIFY (read-only, after apply)
--
--   -- 1. No PostgREST client role can read the metrics.
--   SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
--     FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='daily_snapshots'
--    GROUP BY grantee ORDER BY grantee;
--   -- Expect: service_role only.
--
--   SELECT has_function_privilege('anon','fn_rollup_daily_snapshots(date,date)','EXECUTE')          AS anon_rollup,
--          has_function_privilege('authenticated','fn_rollup_daily_snapshots(date,date)','EXECUTE') AS auth_rollup,
--          has_function_privilege('service_role','fn_rollup_daily_snapshots(date,date)','EXECUTE')  AS svc_rollup;
--   -- Expect: false, false, true.
--
--   -- 2. RLS on, zero policies.
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.daily_snapshots'::regclass;
--   SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='daily_snapshots';
--   -- Expect: true, 0.
--
--   -- 3. Applying the migration populates nothing. The cron does that.
--   SELECT count(*) FROM public.daily_snapshots;
--   -- Expect: 0.
--
--   -- 4. Grain and indexes.
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.daily_snapshots'::regclass AND contype='u';
--   SELECT indexname FROM pg_indexes WHERE tablename='daily_snapshots';
-- ============================================================================
