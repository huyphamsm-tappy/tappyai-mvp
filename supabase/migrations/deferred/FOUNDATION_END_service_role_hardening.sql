-- ============================================================================
-- Controller V2 — FOUNDATION-END HARDENING: Service Role privilege reduction
-- ============================================================================
--
-- ⛔ DO NOT APPLY WITH COMPONENT 1. DO NOT APPLY IN A MIGRATION BATCH.
--
-- GATE: end of the Controller V2 Foundation — after ALL Phase 1 components
--       (Platform Owner, Identity, RBAC, Permission Engine, Capability
--       Registry, Plugin Registry, Audit, Event Bus, Secret Manager, Rate
--       Limiting, Session Security) have shipped and soaked in production.
--
-- RATIONALE: docs/architecture/ADR-017-service-role-hardening-strategy.md
--   (owner decision 2026-08-03 — split out of Component 1 so a privilege
--   revocation is never bundled with a feature migration).
--
-- WHY THIS IS DEFERRED RATHER THAN DROPPED:
--   This is the layer that makes the constitutional rules unbypassable. Until
--   it runs, "only the Platform Owner may grant super_admin" is enforced by
--   SECURITY DEFINER functions plus application checks — strong, but the
--   service-role client still technically retains direct write access to
--   admin_roles. After it runs, that access is gone and a fully compromised
--   /api/admin/* route cannot escalate privilege at all.
--
-- PRECONDITIONS (verify ALL before running — see ADR-017 §5):
--   1. Every Foundation component is deployed and stable.
--   2. `grep -rn "from('admin_roles')" src/` shows NO .insert/.update/.delete —
--      only .select. Any remaining direct write will start failing the moment
--      this runs.
--   3. fn_grant_admin_role and fn_revoke_admin_role have prosecdef = true.
--   4. A rollback window is agreed with the owner.
--
-- IDEMPOTENT: REVOKE on an already-revoked privilege is a no-op.
--
-- ROLLBACK:
--   GRANT INSERT, UPDATE, DELETE ON admin_roles TO service_role;
--   GRANT INSERT, UPDATE, DELETE ON platform_owner TO service_role;
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
