-- ---------------------------------------------------------------------------
-- anon_chat_usage_today() — the READ-ONLY sibling of anon_chat_usage_increment()
--
-- Additive only: one new function, its grants, nothing else. No schema change, no
-- data change, no change to the increment function or the table.
-- ---------------------------------------------------------------------------
-- WHY — the anonymous quota had TWO authorities and they could disagree
-- ---------------------------------------------------------------------------
-- ENFORCEMENT (what actually stops a guest):
--     /api/chat → anon_chat_usage_increment() → public.anon_chat_usage.count
--
-- DISPLAY (what the paywall told the guest they had left):
--     /api/subscription → countTodayUserMessages() → user-role rows in `conversations`
--
-- Those count different things. The RPC counts ATTEMPTS: it increments once per
-- request, before the model is called. `conversations` records TURNS THAT LANDED. A
-- refused turn, an abandoned stream, a client that gave up mid-response — each of
-- those moves one counter and not the other.
--
-- The visible effect: "3 messages remaining" above a chat box that answers 401
-- anon_limit_reached. The user is told a number that nothing enforces, and there is no
-- way for them to tell which one is real. C48 fixed the LIMIT half of this divergence
-- (the paywall was quoting the REGISTERED limit to guests); the COUNT half needed this
-- function and was recorded rather than hidden.
--
-- After this, `/api/subscription` reads the SAME row `/api/chat` writes, so the number
-- shown and the number enforced come from one place and cannot drift apart.
--
-- ---------------------------------------------------------------------------
-- WHY A FUNCTION AND NOT A SELECT
-- ---------------------------------------------------------------------------
-- `public.anon_chat_usage` has RLS enabled and NO policy granting SELECT — deliberately,
-- since nothing but the counter should read it. Adding a policy would widen the table's
-- exposure to make one number readable. A SECURITY DEFINER function that returns only
-- the CALLER'S OWN count for TODAY exposes exactly that number and nothing else: no
-- other user's row, no history, no way to enumerate.
--
-- 🚨 Read-only by construction, and that matters: if this function could increment, the
-- act of RENDERING the paywall would consume the quota it is describing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.anon_chat_usage_today()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  used integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- Same gate as the increment function: this counter belongs to anonymous sessions.
  -- A logged-in user is governed by the free/pro tier logic and has no row here; letting
  -- them read it would return 0 and invite a caller to treat that as "no quota used".
  IF NOT COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'not an anonymous session';
  END IF;

  SELECT count INTO used
  FROM public.anon_chat_usage
  WHERE user_id = auth.uid()
    AND day = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  -- No row means no attempt today. The day boundary is Asia/Ho_Chi_Minh, identical to
  -- the increment function's — a different timezone here would reset the displayed
  -- count hours before or after the enforced one, which is the same class of bug.
  RETURN COALESCE(used, 0);
END;
$$;

-- ACL, per ADR-019 (Supabase grant model): revoke from EVERYTHING, then grant back only the role
-- that actually calls the function.
--
-- 🚨 A bare REVOKE ... FROM PUBLIC does NOT remove `anon` on this project: pg_default_acl grants
-- EXECUTE on every NEW function in `public` to anon, authenticated and service_role as SEPARATE
-- acl entries, which a PUBLIC revoke leaves in place. Each role must be named.
--
-- 🔑 `authenticated` is named in the REVOKE even though it is granted back on the next line, and
-- that is not redundant. The revoke-then-grant pair makes the resulting ACL a statement of intent
-- rather than a function of whatever pg_default_acl happened to hand out — the end state is the
-- same either way today, and only one of the two forms stays correct if the default privileges
-- change. `20260808_anon_chat_usage_acl_hardening.sql` writes `FROM PUBLIC, anon` and is pinned in
-- the guard's legacy list for exactly this reason; this file does not inherit that.
REVOKE EXECUTE ON FUNCTION public.anon_chat_usage_today()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.anon_chat_usage_today()
  TO authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICATION — expect exactly this after applying
-- ---------------------------------------------------------------------------
--   SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
--               ELSE a.grantee::regrole::text END AS grantee
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
--   WHERE n.nspname = 'public' AND p.proname = 'anon_chat_usage_today'
--     AND a.privilege_type = 'EXECUTE'
--   ORDER BY 1;
--
--   Expected: postgres (owner) and authenticated ONLY.
--   Any row naming anon, or grantee 0 (PUBLIC), means the revoke did not take.
--
--   And that it cannot write:
--     SELECT provolatile FROM pg_proc
--      WHERE proname = 'anon_chat_usage_today';   -- expect 's' (STABLE)
-- ---------------------------------------------------------------------------
