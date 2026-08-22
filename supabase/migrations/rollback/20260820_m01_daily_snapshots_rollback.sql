-- ============================================================================
-- ROLLBACK for supabase/migrations/20260820_m01_daily_snapshots.sql
-- Controller V2 - Module 01 Home Dashboard.
--
-- SAFE, and reversible without data loss that matters.
--
-- `daily_snapshots` is a DERIVED table: every row is recomputable from
-- `user_events` and `profiles` by re-running the rollup. Dropping it loses no
-- source data. The one thing it does lose is the `is_final` history - which day
-- was closed when - so if any day has been finalised, export before dropping:
--
--     SELECT snapshot_date, is_final, reconciled_at
--       FROM public.daily_snapshots WHERE is_final ORDER BY snapshot_date;
--
-- ORDER MATTERS. Deploy the code rollback FIRST, or the Home will read a table
-- that no longer exists. It degrades rather than crashes - `fetchHomeKpis`
-- catches the error and the KPI block renders "metrics unreachable" - but that
-- is a visible, misleading state, not a clean rollback.
--
--   1. revert the application (the KPI block stops reading the table)
--   2. THEN run this file
--
-- The cron is safe either way: its snapshot step captures its own error and
-- never blocks steps 1-4.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_finalize_daily_snapshots(DATE);
DROP FUNCTION IF EXISTS public.fn_rollup_daily_snapshots(DATE, DATE);

DROP INDEX IF EXISTS idx_daily_snapshots_platform;
DROP INDEX IF EXISTS idx_daily_snapshots_date;
DROP TABLE IF EXISTS public.daily_snapshots;

-- ============================================================================
-- VERIFY (read-only, after rollback)
--
--   SELECT to_regclass('public.daily_snapshots');
--   -- Expect: NULL.
--
--   SELECT count(*) FROM pg_proc WHERE proname LIKE 'fn_%_daily_snapshots';
--   -- Expect: 0.
--
--   SELECT count(*) FROM public.user_events;
--   -- Expect: unchanged - no source data is touched by this rollback.
-- ============================================================================
