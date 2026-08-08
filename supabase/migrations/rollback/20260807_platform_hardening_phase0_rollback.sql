-- ============================================================================
-- ROLLBACK for 20260807_platform_hardening_phase0.sql
--
-- ── ROLLBACK CONTRACT ───────────────────────────────────────────────────────
--
-- THIS FILE REVERSES ONLY THE CHANGES INTRODUCED BY PLATFORM HARDENING PHASE 0.
-- IT DOES NOT RESTORE THE COMPLETE HISTORICAL ACL OF THESE TWO FUNCTIONS.
--
-- SCOPE — exactly TWO functions: get_interaction_avgs and
-- sync_review_watch_stats. PH-0 was deduplicated after the P0 hotfix took
-- ownership of the other four (fn_is_platform_owner, fn_grant_admin_role,
-- fn_revoke_admin_role, fn_sync_last_login); this rollback must therefore NOT
-- restore anon/authenticated on those four — doing so would re-open the very
-- holes the hotfix closed. Their rollbacks live beside the hotfix migrations
-- (supabase/migrations/rollback/20260807_platform_owner_revoke_public_execute_rollback.sql
-- and ..._20260807b_sync_last_login_revoke_public_execute_rollback.sql) and are
-- the ONLY files permitted to re-open them.
--
-- What it undoes:  the EXECUTE privileges that
--                  20260807_platform_hardening_phase0.sql revoked from
--                  `anon` and `authenticated` on the two functions above.
--
-- What it leaves:  every other aspect of each function's ACL, including
--                  grantees PH-0 never touched (`postgres`, `service_role`)
--                  and the `PUBLIC` grant PH-0 revoked and this file
--                  deliberately does not return — see §"NOT RESTORED" below.
--
-- Consequence, stated plainly: running this file returns the database to a
-- state that is FUNCTIONALLY equivalent to pre-PH-0 for the roles that
-- actually called these functions, but is NOT byte-identical to the pre-PH-0
-- ACL. Anyone auditing `proacl` after a rollback will see one difference, and
-- that difference is intentional and documented below.
--
-- Nothing outside privileges was ever touched by PH-0, so nothing outside
-- privileges is touched here: no schema, no data, no RLS, no trigger, no
-- function body, no pg_default_acl.
--
-- NOT applied automatically. Kept beside the migration so the rollback is a
-- rehearsed file rather than something improvised during an incident.
--
-- ⚠️ THIS RE-OPENS `anon` REACH ON TWO SECURITY DEFINER FUNCTIONS
-- (get_interaction_avgs, sync_review_watch_stats). Run it only to restore
-- service after a proven regression, and re-apply the migration as soon as the
-- cause is understood.
--
-- ── NOT RESTORED, AND WHY ───────────────────────────────────────────────────
--
-- 1. `PUBLIC`. The migration revoked it; this file does NOT grant it back.
--    Measured pre-PH-0 state was PUBLIC + anon + authenticated + postgres +
--    service_role on both functions. This is the one intentional gap in the
--    rollback contract above. Restoring the PUBLIC grant would re-open the
--    functions to every role that exists now or is created later, which is
--    strictly worse than the state this rollback is meant to reach. Granting
--    `anon` and `authenticated` explicitly restores reachability for exactly
--    the roles that had it in practice.
--
-- 2. `service_role`. The migration never revoked it, so there is nothing to
--    restore. It still holds EXECUTE on both.
--
-- 3. `postgres`. Owner privileges were never in scope.
--
-- IDEMPOTENT. GRANT of an already-held privilege is a no-op. Safe to re-run.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Preconditions — fail loudly, never silently
--
-- Same instrument as the migration's §0. A rollback that reports success while
-- granting nothing is worse than one that refuses: during an incident it would
-- send the operator looking for the problem somewhere else.
-- ---------------------------------------------------------------------------
DO $preconditions$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(sig, ', ' ORDER BY sig) INTO v_missing
  FROM (VALUES
    ('get_interaction_avgs(UUID)'),
    ('sync_review_watch_stats(UUID)')
  ) AS t(sig)
  WHERE to_regprocedure('public.' || sig) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Platform Hardening Phase 0 rollback: target function(s) do not exist: %. Nothing was rolled back.',
      v_missing USING ERRCODE = '42883';
  END IF;
END
$preconditions$;


-- ---------------------------------------------------------------------------
-- 1. Reverse the migration
--
-- `sync_review_watch_stats` is the asymmetric one: the migration revoked only
-- PUBLIC and `anon` from it, deliberately keeping `authenticated` because that
-- is the role its single caller runs as. Naming `authenticated` here is a
-- no-op restatement, kept so both lines have the same shape and so the end
-- state is readable without cross-referencing the migration.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_interaction_avgs(UUID) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION sync_review_watch_stats(UUID) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Verification after rollback
--
-- Expected: anon_exec and auth_exec TRUE on both; svc_exec TRUE on both
-- (never revoked). PUBLIC remains revoked by design — see the header.
--
--   SELECT p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--          has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('get_interaction_avgs','sync_review_watch_stats')
--   ORDER BY p.proname;
--
-- ⚠️ has_function_privilege answers "can this role call it". It does NOT prove
-- how the privilege was obtained. To distinguish an explicit grant from the
-- PUBLIC fallback, read `proacl` — see ADR-019.
-- ---------------------------------------------------------------------------
