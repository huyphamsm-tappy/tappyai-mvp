-- ---------------------------------------------------------------------------
-- F-032 — admin-role RPCs: derive the actor from auth.uid(), never from a
--         caller-supplied parameter. Plus an explicit REVOKE, re-asserted.
--
-- Closes the deferred item named in 20260807_platform_owner_revoke_public_execute.sql
-- ("WHAT THIS DOES NOT FIX"): fn_grant_admin_role / fn_revoke_admin_role took the
-- actor as the caller-supplied p_actor_id and, for non-super_admin roles, performed
-- NO authorization check. Today that is unreachable — EXECUTE is revoked from anon
-- and authenticated (20260807…) — so it is not an active vulnerability. But the
-- function's ONLY defense was that grant: if EXECUTE were ever widened, any user
-- could self-grant admin with two accounts by passing someone else's uid as
-- p_actor_id. This migration removes that latent P0 by authorizing on the VERIFIED
-- request identity instead.
--
-- Behaviour after this migration:
--   • service-role caller (the app's createAdminClient — the ONLY legitimate
--     programmatic caller; the API layer authorizes the admin first): allowed.
--     p_actor_id is kept ONLY as the audit trail (granted_by). Detected by the
--     request's JWT role claim (auth.jwt()->>'role' = 'service_role'), which the
--     service-role key carries and no client can forge (PostgREST sets the claims
--     GUC from the verified JWT; a signed-in user cannot set it).
--   • any OTHER caller (defense in depth — unreachable while EXECUTE is revoked):
--     must PROVE, via auth.uid(), that they are the platform owner or hold an
--     active super_admin/admin role; otherwise 42501. p_actor_id is ignored for the
--     authorization decision, so spoofing it no longer helps.
--
-- No signature change (so the existing ACL is preserved and no caller breaks) and
-- no schema/data change. §2 re-asserts the REVOKE/GRANT so the end state is
-- self-contained and does not rely on a CREATE OR REPLACE preserving the ACL.
--
-- WHY A BARE `REVOKE ... FROM PUBLIC` IS NOT ENOUGH (the thing holding the line
-- today): on Supabase two independent grants reach every new function — Postgres
-- grants EXECUTE to PUBLIC by default, AND Supabase runs
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- so anon and authenticated hold SEPARATE, explicit grants. All three grantees
-- must be named in the REVOKE (as 20260807_platform_owner_revoke_public_execute.sql
-- established for these functions, and 20260807_audit_chain.sql before it).
--
-- Applied by hand in the Supabase SQL editor (repo convention). Idempotent;
-- re-running the whole file is a no-op. Requires roles anon, authenticated,
-- service_role to exist (REVOKE FROM a missing role raises 42704 and aborts,
-- intentionally).
-- ---------------------------------------------------------------------------

-- 1. fn_grant_admin_role — authorize on the verified identity, not on p_actor_id.
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
    v_row      admin_roles;
    v_jwt_role TEXT := auth.jwt() ->> 'role';
    v_actor    UUID;
BEGIN
    -- Who is acting, decided from the VERIFIED request (never from p_actor_id).
    IF v_jwt_role = 'service_role' THEN
        -- Trusted server path. The application authorizes the admin in its API
        -- layer and then calls this through the service-role client, passing the
        -- acting admin's id as p_actor_id purely for the audit trail (granted_by).
        v_actor := p_actor_id;
    ELSE
        -- Defense in depth: unreachable today (EXECUTE revoked below), kept so the
        -- function stays safe even if that grant is ever widened. A real caller
        -- must be the platform owner or an active super_admin/admin.
        v_actor := auth.uid();
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: unauthenticated caller'
                USING ERRCODE = '42501';
        END IF;
        IF NOT (
            fn_is_platform_owner(v_actor)
            OR EXISTS (
                SELECT 1 FROM admin_roles
                WHERE user_id = v_actor
                  AND role IN ('super_admin', 'admin')
                  AND (expires_at IS NULL OR expires_at > NOW())
            )
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: caller is not a platform owner or admin'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Constitutional rules, now evaluated against the DERIVED actor.
    -- Self-promotion (checked first so it applies to the Owner too).
    IF v_actor = p_user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: self-promotion is not permitted'
            USING ERRCODE = '42501';
    END IF;

    -- Only the Platform Owner may create a Super Admin.
    IF p_role = 'super_admin' AND NOT fn_is_platform_owner(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may grant super_admin'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO admin_roles (user_id, role, granted_by, notes, expires_at)
    VALUES (p_user_id, p_role, v_actor, p_notes, p_expires_at)
    RETURNING * INTO v_row;

    RETURN v_row;
END$$;

-- 2. fn_revoke_admin_role — same actor-derivation (identical latent flaw).
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
    v_row      admin_roles;
    v_count    INT;
    v_jwt_role TEXT := auth.jwt() ->> 'role';
    v_actor    UUID;
BEGIN
    IF v_jwt_role = 'service_role' THEN
        v_actor := p_actor_id;
    ELSE
        v_actor := auth.uid();
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: unauthenticated caller'
                USING ERRCODE = '42501';
        END IF;
        IF NOT (
            fn_is_platform_owner(v_actor)
            OR EXISTS (
                SELECT 1 FROM admin_roles
                WHERE user_id = v_actor
                  AND role IN ('super_admin', 'admin')
                  AND (expires_at IS NULL OR expires_at > NOW())
            )
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: caller is not a platform owner or admin'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO v_row FROM admin_roles WHERE id = p_role_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: role assignment does not exist'
            USING ERRCODE = 'P0002';
    END IF;

    -- Only the Platform Owner may demote a Super Admin.
    IF v_row.role = 'super_admin' AND NOT fn_is_platform_owner(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may revoke super_admin'
            USING ERRCODE = '42501';
    END IF;

    -- Never remove the last active super_admin (pre-existing lockout guard).
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

    -- The Owner's own admin rows may not be stripped by anyone but themselves.
    IF fn_is_platform_owner(v_row.user_id) AND v_actor <> v_row.user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot revoke roles from the Platform Owner'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM admin_roles WHERE id = p_role_id;
    RETURN v_row;
END$$;

-- ---------------------------------------------------------------------------
-- 3. Re-assert the lockdown. CREATE OR REPLACE preserves the existing ACL, but
--    stating it here makes the end state self-contained and independent of the
--    order these files are applied in. All three grantees, per the WHY above.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION fn_grant_admin_role(UUID, UUID, admin_role, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION fn_revoke_admin_role(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- VERIFICATION — run after applying, expect exactly these results
-- ---------------------------------------------------------------------------
-- (a) No anon/authenticated/PUBLIC EXECUTE survives; service_role does:
--   SELECT p.proname, a.grantee::regrole::text, a.privilege_type
--   FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
--   WHERE p.proname IN ('fn_grant_admin_role','fn_revoke_admin_role') ORDER BY 1,2;
-- (b) Over HTTPS with the anon key, as a signed-in user: rpc/fn_grant_admin_role
--     -> 42501 "permission denied for function fn_grant_admin_role".
-- (c) The service-role client still grants admin (used by /api/admin/rbac/roles).
-- ---------------------------------------------------------------------------
