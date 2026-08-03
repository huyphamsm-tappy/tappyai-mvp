-- ============================================================================
-- Controller V2 — Phase 1, Component 1: PLATFORM OWNER — LOCKDOWN
-- ============================================================================
--
-- ⚠️  APPLY THIS ONLY AFTER THE APPLICATION CODE IS DEPLOYED.
--
-- This revokes the application's ability to write `admin_roles` directly, so
-- the SECURITY DEFINER functions in 20260803_platform_owner.sql become the only
-- write path. It is deliberately a SEPARATE file from the schema migration:
-- the currently deployed code still INSERTs into admin_roles directly, so
-- applying this first would break role granting in production until the deploy
-- lands.
--
-- CORRECT ORDER:
--   1. 20260803_platform_owner.sql
--   2. supabase/seed/platform_owner_bootstrap.sql  (after read-only verification)
--   3. deploy application code
--   4. THIS FILE
--
-- WHY THIS MATTERS MORE THAN THE APPLICATION CHECKS:
--   After this runs, a fully compromised /api/admin/* route CANNOT grant
--   super_admin — the identity it runs as does not hold the privilege. The
--   constitutional rule stops being something application code is trusted to
--   enforce and becomes something the database enforces.
--
-- IDEMPOTENT: REVOKE on an already-revoked privilege is a no-op.
--
-- ROLLBACK (if the deploy must be reverted):
--   GRANT INSERT, UPDATE, DELETE ON admin_roles TO service_role;
-- ============================================================================

-- The service-role client (used by every back-office write path) loses direct
-- write access to admin_roles. SELECT is retained — resolveActor reads roles.
REVOKE INSERT, UPDATE, DELETE ON admin_roles FROM service_role;

-- The functions are SECURITY DEFINER and owned by the migration runner, so they
-- retain the privilege the caller just lost. Callers only need EXECUTE.
GRANT EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fn_is_platform_owner(UUID) TO service_role;

-- platform_owner is never written by the application at all — only by the
-- bootstrap seed and the break-glass runbook, both run manually by the owner.
REVOKE INSERT, UPDATE, DELETE ON platform_owner FROM service_role;
