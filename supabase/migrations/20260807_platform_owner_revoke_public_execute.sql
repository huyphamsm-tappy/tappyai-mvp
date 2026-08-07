-- ---------------------------------------------------------------------------
-- Platform Owner RPCs — REVOKE EXECUTE from PUBLIC, anon and authenticated
--
-- Closes BL-C7-01. Grants ONLY. No business logic, no signature change, no
-- schema change, no data change. Deliberately kept to REVOKE/GRANT so it can be
-- reviewed and reasoned about in isolation — the authorization design of
-- fn_grant_admin_role (see "What this does NOT fix" below) is a separate change.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- 20260803_platform_owner.sql creates three SECURITY DEFINER functions and
-- grants EXECUTE to service_role. It never revokes anything. On this platform a
-- bare GRANT narrows nothing, because two independent grants already reach a
-- newly created function:
--
--   1. PostgreSQL grants EXECUTE on every new function to PUBLIC by default
--      (the `=X/postgres` entry in proacl).
--   2. Supabase additionally configures
--        ALTER DEFAULT PRIVILEGES IN SCHEMA public
--          GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
--      so every new function is ALSO granted to `anon` and `authenticated`
--      EXPLICITLY. Those are separate ACL entries; REVOKE ... FROM PUBLIC does
--      not touch them.
--
-- This is the same defect as F-04 in 20260807_audit_chain.sql, which shipped
-- revoking only from PUBLIC, looked correct in proacl, and left `anon` able to
-- call the function over HTTPS. That file now revokes from all three grantees;
-- this file brings 20260803_platform_owner.sql to the same standard.
--
-- ---------------------------------------------------------------------------
-- MEASURED ON PRODUCTION BEFORE THIS MIGRATION
-- ---------------------------------------------------------------------------
-- With the public anon key only, over HTTPS, unauthenticated:
--
--   POST /rest/v1/rpc/fn_is_platform_owner   -> 200, returned `false`
--   POST /rest/v1/rpc/fn_grant_admin_role    -> 42501 "FORBIDDEN: self-promotion
--                                               is not permitted"
--   POST /rest/v1/rpc/fn_revoke_admin_role   -> P0002 "NOT_FOUND: role
--                                               assignment does not exist"
--
-- The last two are the FUNCTIONS' OWN guards, which means the functions ran.
-- The contrast that proves it: fn_verify_audit_chain, already revoked by
-- 20260807_audit_chain.sql, answers the same caller with
-- `42501 permission denied for function` — a different error entirely. Both
-- probes above were chosen to abort before any write (actor = target trips the
-- self-promotion guard; a non-existent role id trips NOT_FOUND), so nothing was
-- granted or revoked while measuring.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT FIX  (deliberate — not in scope for a grants-only change)
-- ---------------------------------------------------------------------------
-- fn_grant_admin_role takes `p_actor_id` as a CALLER-SUPPLIED PARAMETER rather
-- than deriving it from auth.uid(), and only checks authorization when
-- p_role = 'super_admin'. For 'admin', 'moderator' and 'analyst' it performs no
-- authorization check at all before INSERT. fn_revoke_admin_role has the same
-- shape. After this migration those paths are no longer reachable by `anon` or
-- `authenticated`, so the exposure is closed; the trust-the-caller design is
-- not. Deriving the actor from auth.uid() is a behaviour change and belongs in
-- its own migration with its own tests.
--
-- ---------------------------------------------------------------------------
-- NOTES ON APPLYING
-- ---------------------------------------------------------------------------
-- Safe to apply section by section (this repository applies SQL to production
-- by hand in the Supabase SQL editor): each statement is independent and
-- idempotent. Re-running the whole file is a no-op.
--
-- REQUIRES the roles `anon`, `authenticated` and `service_role` to exist.
-- REVOKE ... FROM <missing role> raises `42704: role "..." does not exist` and
-- aborts. That is intended: a role-existence guard that skipped silently would
-- produce a migration that "succeeds" while revoking nothing, which is the
-- original defect wearing a better disguise.
--
-- SECURITY DEFINER callers are unaffected. Inside a definer function the
-- current user is the function's owner, and the owner's privileges are not what
-- these statements revoke. The application reaches these functions through the
-- service-role client, whose grant is re-asserted below.
-- ---------------------------------------------------------------------------

-- 1. fn_is_platform_owner — an unauthenticated oracle for "is this UUID the
--    platform owner?", and the check fn_grant_admin_role leans on.
REVOKE EXECUTE ON FUNCTION fn_is_platform_owner(UUID)
  FROM PUBLIC, anon, authenticated;

-- 2. fn_grant_admin_role — writes to admin_roles.
REVOKE EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

-- 3. fn_revoke_admin_role — writes to admin_roles.
REVOKE EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- 4. Re-assert the only grant the application needs. Already present from
--    20260803_platform_owner.sql; repeated so this file is self-contained and
--    so a reviewer can see the end state without opening another migration.
GRANT EXECUTE ON FUNCTION fn_is_platform_owner(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- VERIFICATION — run after applying, expect exactly these results
-- ---------------------------------------------------------------------------
-- (a) In SQL: no anon/authenticated/PUBLIC entry survives, service_role does.
--
--   SELECT p.proname, a.grantee::regrole::text, a.privilege_type
--   FROM pg_proc p
--   CROSS JOIN LATERAL aclexplode(p.proacl) a
--   WHERE p.proname IN ('fn_is_platform_owner','fn_grant_admin_role','fn_revoke_admin_role')
--   ORDER BY 1, 2;
--
--   Expected: only `service_role` (and the function owner). Any row naming
--   `anon`, `authenticated`, or grantee 0 (= PUBLIC) means the revoke did not
--   take.
--
-- (b) Over HTTPS with the public anon key — all three must now answer
--     `42501 permission denied for function <name>`, the same error
--     fn_verify_audit_chain already gives. Anything else (200, FORBIDDEN,
--     NOT_FOUND) means the function still executed.
--
-- (c) service_role must still work: the Owner signing in and loading /admin
--     exercises fn_is_platform_owner on every request. A 403 "ownership
--     assertion failed" there would mean §4 did not apply.
-- ---------------------------------------------------------------------------
