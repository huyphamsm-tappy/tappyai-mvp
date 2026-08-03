-- ============================================================================
-- Controller V2 — Phase 1, Component 1: PLATFORM OWNER
-- Design: docs/controller-v2/03_PHASE1_FOUNDATION_DESIGN.md §3
-- ============================================================================
--
-- CONSTITUTIONAL RULES ENFORCED HERE (not in application code):
--   * There is exactly ONE Platform Owner.
--   * Only the Platform Owner may grant or revoke `super_admin`.
--   * Nobody may promote themselves.
--
-- WHY THE OWNER IS NOT A ROLE:
--   `owner` is deliberately NOT added to the `admin_role` enum. If it were a row
--   in admin_roles it would travel through the same grant API, the same UI and
--   the same code paths as every other role, and "only the Owner may grant it"
--   would be one more `if` statement to get wrong. Keeping the Owner in its own
--   table makes the dangerous operation structurally unreachable, not merely
--   guarded.
--
-- IDEMPOTENT: safe to run repeatedly (CREATE ... IF NOT EXISTS / OR REPLACE).
-- This migration creates NO owner row — bootstrap is separate and guarded:
--   supabase/seed/platform_owner_bootstrap.sql
--
-- DEPLOYMENT ORDER — READ BEFORE APPLYING:
--   1. THIS migration
--   2. bootstrap seed (after read-only verification of exactly one super_admin)
--   3. deploy application code
--   4. ONLY THEN 20260803_platform_owner_lockdown.sql (the REVOKE)
--   Applying the lockdown before step 3 breaks role granting in production,
--   because the currently deployed code still INSERTs into admin_roles directly.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. platform_owner
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_owner (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT, not CASCADE: deleting the Owner's profile must fail loudly
    -- rather than silently leaving the platform ownerless.
    user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    active       BOOLEAN NOT NULL DEFAULT true,
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 'bootstrap' | 'break_glass' | the granting owner's uuid
    assigned_by  TEXT NOT NULL,
    revoked_at   TIMESTAMPTZ,
    notes        TEXT
);

-- AT MOST ONE active owner — enforced by the database, not by application code.
-- An application-level count check races under concurrency; a unique index cannot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_owner_single_active
    ON platform_owner (active) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_platform_owner_user
    ON platform_owner (user_id);

-- Deny-by-default. The Controller reads this via the service-role client.
ALTER TABLE platform_owner ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. fn_is_platform_owner — single definition of "is the Owner"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_is_platform_owner(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM platform_owner
        WHERE user_id = p_user_id AND active = true
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. fn_grant_admin_role — the ONLY sanctioned way to create an admin role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_grant_admin_role(
    p_actor_id   UUID,
    p_user_id    UUID,
    p_role       admin_role,
    p_notes      TEXT DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS admin_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row admin_roles;
BEGIN
    -- Constitutional rule: nobody may promote themselves. Checked first so it
    -- applies to the Owner too — the Owner has no reason to self-grant, and an
    -- audit trail showing self-grants would be indistinguishable from abuse.
    IF p_actor_id = p_user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: self-promotion is not permitted'
            USING ERRCODE = '42501';
    END IF;

    -- Constitutional rule: only the Platform Owner may create a Super Admin.
    IF p_role = 'super_admin' AND NOT fn_is_platform_owner(p_actor_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may grant super_admin'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO admin_roles (user_id, role, granted_by, notes, expires_at)
    VALUES (p_user_id, p_role, p_actor_id, p_notes, p_expires_at)
    RETURNING * INTO v_row;

    RETURN v_row;
END$$;

-- ---------------------------------------------------------------------------
-- 4. fn_revoke_admin_role — the ONLY sanctioned way to remove an admin role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_revoke_admin_role(
    p_actor_id UUID,
    p_role_id  UUID
)
RETURNS admin_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row   admin_roles;
    v_count INT;
BEGIN
    SELECT * INTO v_row FROM admin_roles WHERE id = p_role_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: role assignment does not exist'
            USING ERRCODE = 'P0002';
    END IF;

    -- Constitutional rule: only the Platform Owner may demote a Super Admin.
    IF v_row.role = 'super_admin' AND NOT fn_is_platform_owner(p_actor_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may revoke super_admin'
            USING ERRCODE = '42501';
    END IF;

    -- Lockout guard (pre-existing behaviour, preserved): never remove the last
    -- active super_admin. Counted over ACTIVE grants only, matching how
    -- resolveActor interprets expires_at.
    IF v_row.role = 'super_admin' THEN
        SELECT COUNT(*) INTO v_count
        FROM admin_roles
        WHERE role = 'super_admin'
          AND (expires_at IS NULL OR expires_at > NOW());
        IF v_count <= 1 THEN
            RAISE EXCEPTION 'CONFLICT: cannot revoke the last remaining super_admin'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- The Owner's own admin rows may not be stripped while they hold ownership;
    -- otherwise a Super Admin could disarm the Owner's back-office access.
    IF fn_is_platform_owner(v_row.user_id) AND p_actor_id <> v_row.user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot revoke roles from the Platform Owner'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM admin_roles WHERE id = p_role_id;
    RETURN v_row;
END$$;
