-- ============================================================================
-- ROLLBACK for 20260807_platform_owner_revoke_public_execute.sql
--
-- ── ROLLBACK CONTRACT ───────────────────────────────────────────────────────
--
-- Reverses ONLY the change that migration made: it restores EXECUTE to `anon`
-- and `authenticated` on the three Platform Owner RPCs. It does NOT restore the
-- complete historical ACL, and it does NOT touch `service_role` (the migration
-- re-asserted that grant; it is left exactly as it is).
--
-- 🔴 THIS RE-OPENS THE VULNERABILITY. After this file runs, `anon` can again
-- reach fn_is_platform_owner (an ownership oracle) and fn_grant_admin_role /
-- fn_revoke_admin_role over PostgREST. Measured pre-hotfix: anon reached the
-- INSERT in fn_grant_admin_role (23503 FK, not 42501). Run this only to restore
-- service after a proven regression caused by the hotfix, and re-apply the
-- hotfix the moment the cause is understood.
--
-- What it undoes:  the REVOKE of anon + authenticated on the three RPCs.
-- What it leaves:  service_role (un-revoked by the migration), PUBLIC (revoked
--                  by the migration and deliberately NOT returned — restoring
--                  it would re-open the functions to every role now and future),
--                  and every function body / RLS / schema (untouched).
--
-- IDEMPOTENT — GRANT of an already-held privilege is a no-op.
-- NO DDL, NO DML, NO data change.
-- REQUIRES roles `anon` and `authenticated` to exist; GRANT ... TO <missing>
-- raises 42704 and aborts. Intended: a rollback that granted nothing while
-- reporting success would mislead an operator mid-incident.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Preconditions — fail loudly if a target function is absent.
-- ---------------------------------------------------------------------------
DO $rollback_preconditions$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(sig, ', ' ORDER BY sig) INTO v_missing
  FROM (VALUES
    ('fn_is_platform_owner(UUID)'),
    ('fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ)'),
    ('fn_revoke_admin_role(UUID, UUID)')
  ) AS t(sig)
  WHERE to_regprocedure('public.' || sig) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Platform Owner RPC rollback: target function(s) do not exist: %. Nothing was rolled back.',
      v_missing USING ERRCODE = '42883';
  END IF;
END
$rollback_preconditions$;


-- ---------------------------------------------------------------------------
-- 1. Restore anon + authenticated. Exact inverse of the migration's REVOKE.
--    PUBLIC is deliberately NOT restored; service_role is not touched.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_is_platform_owner(UUID) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID) TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Verification after rollback
--    Expect anon + authenticated + service_role all present; PUBLIC absent.
--
--   SELECT p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('fn_is_platform_owner','fn_grant_admin_role','fn_revoke_admin_role');
-- ---------------------------------------------------------------------------
