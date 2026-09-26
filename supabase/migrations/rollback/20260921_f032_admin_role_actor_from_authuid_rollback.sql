-- ---------------------------------------------------------------------------
-- ROLLBACK of 20260921_f032_admin_role_actor_from_authuid.sql
--
-- Restores fn_grant_admin_role / fn_revoke_admin_role to their bodies as of
-- 20260803_platform_owner.sql (actor = the caller-supplied p_actor_id), and
-- re-asserts the lockdown REVOKE/GRANT so the end state matches the world AFTER
-- 20260807_platform_owner_revoke_public_execute.sql (the functions stay
-- service_role-only; only the internal actor-derivation is undone).
--
-- This UNBUILDS the F-032 change and nothing else: no signature change, no
-- schema/data change, no touch to fn_is_platform_owner or the grants beyond the
-- re-assertion below. Idempotent.
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
    IF p_actor_id = p_user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: self-promotion is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF p_role = 'super_admin' AND NOT fn_is_platform_owner(p_actor_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may grant super_admin'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO admin_roles (user_id, role, granted_by, notes, expires_at)
    VALUES (p_user_id, p_role, p_actor_id, p_notes, p_expires_at)
    RETURNING * INTO v_row;

    RETURN v_row;
END$$;

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

    IF v_row.role = 'super_admin' AND NOT fn_is_platform_owner(p_actor_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may revoke super_admin'
            USING ERRCODE = '42501';
    END IF;

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

    IF fn_is_platform_owner(v_row.user_id) AND p_actor_id <> v_row.user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot revoke roles from the Platform Owner'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM admin_roles WHERE id = p_role_id;
    RETURN v_row;
END$$;

-- Keep the lockdown (this rollback returns to the post-20260807 state, not the
-- born-open one). All three grantees.
REVOKE EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID) TO service_role;
