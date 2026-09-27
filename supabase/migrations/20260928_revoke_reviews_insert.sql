-- ---------------------------------------------------------------------------
-- security-audit H1 (INSERT half) · only the server creates review rows
--
-- 🚨 DEPLOY ORDER: ship the code change FIRST (POST /api/reviews writes with the service role,
-- commit "fix(security): write reviews with the service role …"), and only then apply this file.
-- Applied before that code is live, every review upload fails with a permission error — this
-- migration cannot detect which code is deployed.
--
-- GATE: applied to production ONLY under explicit Owner authorization.
--
-- WHY. POST /api/reviews used to INSERT with the caller's own client, so `authenticated` had to
-- hold INSERT on `reviews` (production's policy: WITH CHECK auth.uid() = user_id — the row's
-- owner, nothing about its columns). Anyone could therefore skip the route and POST a row straight
-- to PostgREST with publication_state 'PUBLISHED', is_verified true, any counters — moderation
-- bypassed at creation, the twin of the UPDATE hole closed by
-- 20260927_owner_update_column_privileges.sql.
--
-- WHAT. The route now writes with the service role and decides every sensitive column itself
-- (user_id from the session, is_verified from the booking lookup, lifecycle from
-- decidePublication). So anon and authenticated lose INSERT on `reviews` entirely. The service
-- role keeps ALL. SELECT / UPDATE (is_hidden) / DELETE are unchanged. The INSERT RLS policy is
-- left in place — without the privilege it no longer admits anything, and its exact name exists
-- only in production.
--
-- PRE-FLIGHT. A SECURITY INVOKER function that inserts into reviews would run as the caller and
-- start failing. None exists in this repository; the check is for the live database, which may
-- carry objects the repository never saw.
--
-- Idempotent. Rollback: rollback/20260928_revoke_reviews_insert_rollback.sql (reopens the hole).
-- ---------------------------------------------------------------------------

DO $$
DECLARE invoker TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO invoker
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND NOT p.prosecdef AND p.prokind = 'f'
     AND p.prosrc ~* 'insert[[:space:]]+into[[:space:]]+(public[.])?reviews([^a-z_]|$)';
  IF invoker IS NOT NULL THEN
    RAISE EXCEPTION 'revoke_reviews_insert: SECURITY INVOKER function(s) % insert into public.reviews and would fail once callers lose INSERT. Make them SECURITY DEFINER (with a pinned search_path) or remove them, then run this again.', invoker;
  END IF;
END $$;

REVOKE INSERT ON TABLE public.reviews FROM PUBLIC, anon, authenticated;
