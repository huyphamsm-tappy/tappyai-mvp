-- ---------------------------------------------------------------------------
-- security-audit H1 + M1 · owners may UPDATE only the columns the app lets them edit
--
-- GATE: applied to production ONLY under explicit Owner authorization.
--
-- WHY. RLS decides WHICH ROWS a caller may update; it says nothing about WHICH COLUMNS.
-- "Users can update own reviews" (20260703_add_reviews_update_policy.sql) and
-- "Users can update own profile" (supabase-schema.sql) therefore let any signed-in user PATCH
-- every column of their own row straight through PostgREST — the anon key is public and the JWT
-- is their own — skipping the API, which allows far less:
--   reviews:  publication_state 'RESTRICTED' / 'UNDER_REVIEW' -> 'PUBLISHED' or NULL, which
--             undoes moderation (20260818_publication_boundary_rls.sql shows both publicly);
--             is_verified; like / view / save / comment counts; watch_time_avg; completion_rate.
--   profiles: follower_count, following_count, email, stripe_customer_id, onboarded.
--
-- WHAT. Column-level privileges — the layer RLS cannot express:
--   reviews   UPDATE (is_hidden)
--             the only field PATCH /api/reviews/[id] accepts.
--   profiles  UPDATE (id, full_name, bio, language, avatar_url, cover_url)
--             what the USER client writes in src/app/api/profile/route.ts: PATCH updates
--             full_name / bio / language / cover_url (null), the cover upload sets cover_url, and
--             the avatar upload UPSERTs {id, avatar_url}. ON CONFLICT DO UPDATE sets `id` as well,
--             hence `id` — RLS still pins it: the update policy has no WITH CHECK, so its USING
--             (auth.uid() = id) applies to the new row and id can only ever be the caller's own.
--
-- WHAT KEEPS WORKING, AND WHY.
--   * Every counter (view, watch time, like, save, comment, follower / following) is written by a
--     SECURITY DEFINER function — add_phase4.sql, add_counter_security_definer.sql,
--     20260703_fix_like_count_trigger.sql, 20260703_fix_save_count_trigger.sql. It runs as its
--     owner, not as the caller, so these grants do not reach it.
--   * Moderation, onboarding and account deletion write with the service role, which keeps ALL.
--   * SELECT, INSERT and DELETE are unchanged.
--
-- NOT CLOSED HERE — needs a code change first. POST /api/reviews INSERTs with the user client and
-- sets is_verified and the lifecycle columns itself, so INSERT cannot be narrowed yet: a direct
-- PostgREST INSERT can still create a row carrying any of those values. Move that insert to the
-- service role (after the route's own checks), then: REVOKE INSERT ON public.reviews FROM anon,
-- authenticated.
--
-- A column added to either table later is NOT user-updatable unless it is granted here — the safe
-- default. supabase/tests/owner_update_column_privileges.test.ts keeps the profile list in step
-- with the API route.
--
-- Idempotent: revoking the table-level privilege also revokes every column-level UPDATE grant,
-- so re-running always lands on exactly the lists below.
-- Rollback: rollback/20260927_owner_update_column_privileges_rollback.sql (reopens H1/M1).
-- ---------------------------------------------------------------------------

-- PRE-FLIGHT. The counters are safe only because their functions are SECURITY DEFINER — and that
-- depends on migration ORDER: add_social_week2.sql defines update_review_comment_count as INVOKER,
-- add_counter_security_definer.sql redefines it as DEFINER, and replaying by file name runs them the
-- other way round (security-audit M2). If any counter function is INVOKER in THIS database, narrowing
-- UPDATE would make every like / save / comment / follow / view fail. So refuse, and change nothing.
DO $$
DECLARE invoker TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO invoker
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND NOT p.prosecdef
     AND p.proname IN ('increment_review_view', 'sync_review_watch_stats', 'update_follow_counts',
                       'update_review_comment_count', 'update_review_like_count', 'update_review_save_count');
  IF invoker IS NOT NULL THEN
    RAISE EXCEPTION 'owner_update_column_privileges: % % SECURITY INVOKER here and would fail once owners lose UPDATE on reviews/profiles. Re-apply add_counter_security_definer.sql (and the 20260703_fix_*_count_trigger.sql files), then run this again.',
      invoker, CASE WHEN position(',' IN invoker) > 0 THEN 'are' ELSE 'is' END;
  END IF;
END $$;

REVOKE UPDATE ON TABLE public.reviews FROM PUBLIC, anon, authenticated;
GRANT  UPDATE (is_hidden) ON TABLE public.reviews TO authenticated;

REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT  UPDATE (id, full_name, bio, language, avatar_url, cover_url) ON TABLE public.profiles TO authenticated;
