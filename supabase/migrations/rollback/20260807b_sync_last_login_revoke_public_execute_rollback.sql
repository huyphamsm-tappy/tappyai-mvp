-- ============================================================================
-- ROLLBACK for 20260807b_sync_last_login_revoke_public_execute.sql
--
-- ── ROLLBACK CONTRACT ───────────────────────────────────────────────────────
--
-- Reverses ONLY the change that migration made: it restores EXECUTE to `anon`
-- and `authenticated` on public.fn_sync_last_login(). It does NOT restore the
-- complete historical ACL, and it does NOT touch `service_role`.
--
-- 🔴 THIS RE-OPENS THE VULNERABILITY. After this file runs, `anon` can again
-- execute fn_sync_last_login() over PostgREST — a SECURITY DEFINER function that
-- writes last_login_at across user_acquisition, bypassing RLS. Measured
-- pre-hotfix: anon's call wrote. Run this only to restore service after a proven
-- regression, and re-apply the hotfix the moment the cause is understood.
--
-- What it undoes:  the REVOKE of anon + authenticated on fn_sync_last_login.
-- What it leaves:  service_role (which the migration did NOT revoke — it
--                  survives as a materialised default-privilege grant, measured
--                  present after the hotfix), PUBLIC (revoked by the migration
--                  and deliberately NOT returned), and the function body / RLS /
--                  schema (untouched).
--
-- IDEMPOTENT — GRANT of an already-held privilege is a no-op.
-- NO DDL, NO DML, NO data change. NO service_role change.
-- REQUIRES roles `anon` and `authenticated` to exist; GRANT ... TO <missing>
-- raises 42704 and aborts. Intended.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Precondition — fail loudly if the target function is absent.
-- ---------------------------------------------------------------------------
DO $rollback_preconditions$
BEGIN
  IF to_regprocedure('public.fn_sync_last_login()') IS NULL THEN
    RAISE EXCEPTION
      'fn_sync_last_login rollback: target function public.fn_sync_last_login() does not exist. Nothing was rolled back.'
      USING ERRCODE = '42883';
  END IF;
END
$rollback_preconditions$;


-- ---------------------------------------------------------------------------
-- 1. Restore anon + authenticated. Exact inverse of the migration's REVOKE.
--    PUBLIC is deliberately NOT restored; service_role is not touched.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_sync_last_login() TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Verification after rollback
--    Expect anon + authenticated + service_role all present; PUBLIC absent.
--
--   SELECT has_function_privilege('anon', 'public.fn_sync_last_login()', 'EXECUTE')          AS anon,
--          has_function_privilege('authenticated', 'public.fn_sync_last_login()', 'EXECUTE') AS auth,
--          has_function_privilege('service_role', 'public.fn_sync_last_login()', 'EXECUTE')  AS svc;
-- ---------------------------------------------------------------------------
