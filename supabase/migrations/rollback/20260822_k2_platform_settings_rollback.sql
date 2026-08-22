-- ============================================================================
-- ROLLBACK for supabase/migrations/20260822_k2_platform_settings.sql
-- K-2 — the Configuration Provider's runtime tier.
--
-- ⚠️ WHAT THIS TABLE HOLDS. Unlike `daily_snapshots` or `cohort_metrics`, these
-- rows are not derived and cannot be recomputed: each one is a configuration
-- value an operator chose. Unlike `user_notes`, they are not personal data —
-- but they are the only copy of a deliberate operator decision.
--
-- EXPORT BEFORE DROPPING:
--
--     SELECT key, value, scope, value_schema, updated_by
--       FROM public.platform_settings ORDER BY key;
--
-- ORDER MATTERS, AND IT IS THE OPPOSITE OF A DATA TABLE'S. This table sits at
-- the TOP of the configuration precedence chain, so dropping it does not break
-- the Controller — every request falls through to flags, env and manifest
-- defaults, which is the behaviour the loader is written to produce when the
-- table is unreachable. Dropping it therefore SILENTLY CHANGES CONFIGURED
-- VALUES back to their environment values. That is the real risk here, not an
-- outage.
--
--   1. export, as above
--   2. confirm no key in that export differs from what env/defaults resolve to
--      — every one that differs is a setting that will change on rollback
--   3. then run this file
--   4. reverting the application code is OPTIONAL: `loadPlatformSettings`
--      already treats an unreachable table as an empty snapshot and does not
--      throw. The code is safe against this table's absence by construction.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_platform_settings_scope;

DROP TABLE IF EXISTS public.platform_settings;

-- ============================================================================
-- VERIFICATION (read-only, after rollback)
--
--   SELECT count(*) FROM pg_class WHERE relname='platform_settings';   -- 0
--   -- credential-free: the anon probe returns to PGRST205 (absent)
-- ============================================================================
