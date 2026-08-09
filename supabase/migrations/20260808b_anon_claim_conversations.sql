-- ---------------------------------------------------------------------------
-- fn_claim_anonymous_conversations — backend-owned anon → account carry-over
--
-- Moves the conversations owned by a verified anonymous identity to the verified
-- authenticated identity that is claiming them. Conversations ONLY — no broader data
-- migration.
--
-- ---------------------------------------------------------------------------
-- WHY A PRIVILEGED FUNCTION IS REQUIRED (measured, not assumed)
-- ---------------------------------------------------------------------------
-- public.conversations has RLS enabled with exactly one policy:
--     "Users can manage own conversations"  ALL  roles=public  USING (auth.uid() = user_id)
-- There is NO separate WITH CHECK, so PostgreSQL reuses the USING expression to check the
-- NEW row on UPDATE. A client therefore can never re-point user_id at another uid: the new
-- row would have to satisfy auth.uid() = user_id for the *target* user. Ownership transfer
-- is only expressible with privileges that bypass RLS — hence SECURITY DEFINER, owned by a
-- superuser role, reachable by service_role alone.
--
-- ---------------------------------------------------------------------------
-- WHY TAKING IDs AS PARAMETERS IS SAFE HERE (it usually is not — see BL-C7-01)
-- ---------------------------------------------------------------------------
-- BL-C7-01 was exactly this shape and was a Critical: fn_grant_admin_role trusted a
-- caller-supplied p_actor_id AND was reachable by `anon`. Three properties keep this one
-- safe, and ALL THREE must hold — if any is ever relaxed, this becomes the same bug:
--
--   1. NOT CLIENT-REACHABLE. Revoked from PUBLIC/anon/authenticated, granted to
--      service_role only. service_role is not reachable over PostgREST.
--   2. IDs ARE SERVER-DERIVED. The only caller is POST /api/auth/claim-anonymous, which
--      resolves BOTH uuids from tokens it verified with Supabase Auth
--      (`auth.getUser(token)`). No uuid from the request body is ever passed here.
--   3. PROOF OF POSSESSION. The capability is the anonymous ACCESS TOKEN, not an id. You
--      cannot claim another anonymous user's conversations without holding their token.
--
-- The route — not this function — is where identity is established. This function is the
-- transactional primitive and deliberately performs no authorization of its own beyond the
-- structural guards below, because it has no access to the caller's JWT (it runs as
-- service_role on behalf of a request already authenticated at the edge).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_claim_anonymous_conversations(
    p_anon_id   UUID,
    p_target_id UUID
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    moved integer;
BEGIN
    -- Structural guards. These are not a substitute for the route's token verification;
    -- they make misuse impossible to express even from a service-role context.
    IF p_anon_id IS NULL OR p_target_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_CLAIM: both ids are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_anon_id = p_target_id THEN
        -- A self-claim is meaningless and would let a caller "launder" a no-op as success.
        RAISE EXCEPTION 'INVALID_CLAIM: source and target must differ'
            USING ERRCODE = '22023';
    END IF;

    -- The whole transfer is ONE statement, so it is atomic by construction: there is no
    -- interleaving point at which some conversations have moved and others have not.
    -- Idempotent: after the first claim no rows match p_anon_id, so a repeat moves 0 and
    -- cannot duplicate anything (rows MOVE, they are never copied).
    UPDATE public.conversations
       SET user_id    = p_target_id,
           updated_at = now()
     WHERE user_id = p_anon_id;

    GET DIAGNOSTICS moved = ROW_COUNT;
    RETURN moved;
END;
$$;

-- Same platform standard as every other definer function here: Supabase's
-- pg_default_acl grants EXECUTE on new functions to anon AND authenticated explicitly,
-- so REVOKE ... FROM PUBLIC alone would leave both able to call this. Name them.
REVOKE EXECUTE ON FUNCTION public.fn_claim_anonymous_conversations(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_anonymous_conversations(UUID, UUID)
  TO service_role;

-- ---------------------------------------------------------------------------
-- VERIFICATION — expect exactly this after applying
-- ---------------------------------------------------------------------------
--   SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
--               ELSE a.grantee::regrole::text END AS grantee
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
--   WHERE n.nspname = 'public' AND p.proname = 'fn_claim_anonymous_conversations'
--     AND a.privilege_type = 'EXECUTE'
--   ORDER BY 1;
--
--   Expected: postgres (owner) and service_role ONLY.
--   Over HTTPS with the publishable anon key the RPC must answer
--   `42501 permission denied for function fn_claim_anonymous_conversations`.
-- ---------------------------------------------------------------------------
