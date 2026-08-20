-- ============================================================================
-- ROLLBACK for supabase/migrations/20260820_m04_cohort_metrics.sql
-- Controller V2 - Module 04 User Analytics, retention.
--
-- SAFE, and reversible with NO data loss at all.
--
-- `cohort_metrics` is entirely DERIVED: every row is recomputable from
-- `user_events` and `profiles` by re-running the rollup over the same cohort
-- window. Dropping it loses no source data, and - unlike `daily_snapshots` -
-- it holds no finalisation history to export first, because a cohort's rates
-- are recomputed from the closed-day rule rather than latched.
--
-- ORDER MATTERS. Deploy the code rollback FIRST, or the retention view reads a
-- table that no longer exists. It degrades rather than crashes - the service
-- returns its `error` state and the section renders "unreachable" - but that is
-- a visible, misleading state, not a clean rollback.
--
--   1. revert the application (the retention view stops reading the table)
--   2. then run this file
--
-- The cron is NOT a separate deploy step: `fn_rollup_cohort_metrics` is called
-- from `analytics-snapshot`, so reverting the application removes the call in
-- the same deploy. Running this file while the old code is still live makes
-- the cron's cohort step error - captured independently, so steps 1-5 still
-- complete - but it will log a failure every night until the revert lands.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_rollup_cohort_metrics(DATE, DATE, DATE);

-- The index goes with the table; named here so a partial forward-apply (table
-- created, index not) also rolls back cleanly.
DROP INDEX IF EXISTS public.idx_cohort_metrics_date;

DROP TABLE IF EXISTS public.cohort_metrics;

-- ============================================================================
-- VERIFICATION (read-only, after rollback)
--
--   SELECT count(*) FROM pg_class WHERE relname='cohort_metrics';        -- 0
--   SELECT count(*) FROM pg_proc  WHERE proname='fn_rollup_cohort_metrics'; -- 0
--
--   -- credential-free: the anon probe returns to PGRST205 (absent)
-- ============================================================================
