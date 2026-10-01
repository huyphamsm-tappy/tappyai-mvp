-- ============================================================================
-- User blocks, product-wide — the SLICE of Phase 8 Task 17 that the stores need (owner 01/10).
--
-- GATE: applied to production ONLY under explicit Owner authorization, AFTER D1/D2/D4
--       (20260911b, 20260925, 20260925c), after a pg_dump, as its own change.
--       Inert until someone blocks: every new predicate is "NOT in my blocked set".
--
-- WHAT THIS IS NOT (and why it differs from phase8-master 20260924_p8_user_blocks.sql):
--   - It does NOT touch public.chat_blocks: no DROP, no view, no data move, and it does not even READ it. The server writes BOTH
--     tables when someone blocks through the new API (so chat honours an API block).
--   - No p8_review_author(uuid): that function returned the author of ANY review id to ANY signed-in user (P8-11).
--     Here the lookup lives in a PRIVATE schema and only answers a yes/no about the CALLER.
--   - No /api/reports, no sanctions, no audit changes.
--
-- WHAT A BLOCK MEANS (both directions — the blocker is protected from the blocked, and the blocked cannot reach around):
--   - cannot follow each other                              user_follows INSERT        (RESTRICTIVE)
--   - cannot comment on each other's posts                  review_comments INSERT     (RESTRICTIVE)
--   - do not see each other's posts / clips                 reviews SELECT             (RESTRICTIVE)
--   - do not see each other's comments                      review_comments SELECT     (RESTRICTIVE)
--   - do not see notifications caused by each other         notifications SELECT       (RESTRICTIVE)
--   - the review's creator may delete comments on it        review_comments DELETE     (PERMISSIVE, new)
-- A block never tells the blocked person: user_blocks is readable only by the blocker.
--
-- WHY A PRIVATE SCHEMA: the helpers must be EXECUTABLE by authenticated (RLS policies run as the caller) but must
-- NOT be callable as a REST RPC — "who has blocked me" is exactly what must stay unreadable. PostgREST exposes only the
-- schemas it is configured with (Supabase default: public, graphql_public); safety_private is not one of them.
--
-- PERFORMANCE: the blocked set is computed ONCE per statement — (SELECT safety_private.blocked_ids()) is an
-- uncorrelated sub-select, i.e. an InitPlan — and each row is tested with = ANY(array). A per-row function call was
-- measured against it (docs/security/USER-BLOCKS-SLICE.md).
--
-- Rollback: rollback/20261001_user_blocks_rollback.sql
-- ============================================================================

BEGIN;

-- 1. The table ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id),
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
CREATE POLICY user_blocks_insert_own ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY user_blocks_delete_own ON public.user_blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

REVOKE ALL ON TABLE public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_blocks TO authenticated;
GRANT ALL ON TABLE public.user_blocks TO service_role;

-- 2. Private helpers (NOT reachable through the REST API) ----------------------
CREATE SCHEMA IF NOT EXISTS safety_private;
REVOKE ALL ON SCHEMA safety_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA safety_private TO authenticated, service_role;

-- Every account that is in a block pair with the CALLER, either direction, from user_blocks ONLY. (An earlier draft also read the release
-- chat's chat_blocks; that made existing chat blocks bite the moment the migration ran, whatever USER_BLOCKS_ENABLED said — security
-- review 02/10. A block made through the API writes BOTH tables, so the chat honours it; a block made only in the chat does not hide posts.)
-- Definer: it must see the rows other people created. It returns ids only of pairs that include the caller.
CREATE OR REPLACE FUNCTION safety_private.blocked_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT x), '{}'::uuid[]) FROM (
    SELECT blocked_id AS x FROM public.user_blocks WHERE blocker_id = auth.uid()
    UNION ALL SELECT blocker_id FROM public.user_blocks WHERE blocked_id = auth.uid()
  ) t
  WHERE auth.uid() IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION safety_private.blocked_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION safety_private.blocked_ids() TO authenticated, service_role;

-- Is the author of review p_review in a block pair with the caller? A yes/no about the caller only: it never returns
-- the author, and a missing review answers false exactly like "no block" (no existence oracle).
CREATE OR REPLACE FUNCTION safety_private.review_author_blocked(p_review uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reviews r
     WHERE r.id = p_review AND r.user_id = ANY (safety_private.blocked_ids())
  )
$$;
REVOKE EXECUTE ON FUNCTION safety_private.review_author_blocked(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION safety_private.review_author_blocked(uuid) TO authenticated, service_role;

-- 3. Enforcement: RESTRICTIVE policies (AND-ed with every existing one) --------
DROP POLICY IF EXISTS user_blocks_follows_insert ON public.user_follows;
CREATE POLICY user_blocks_follows_insert ON public.user_follows AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT (following_id = ANY ((SELECT safety_private.blocked_ids())::uuid[])));

DROP POLICY IF EXISTS user_blocks_comments_insert ON public.review_comments;
CREATE POLICY user_blocks_comments_insert ON public.review_comments AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT safety_private.review_author_blocked(review_id));

-- A blocked person cannot like the blocker's post by calling the REST API directly either (review 02/10).
DROP POLICY IF EXISTS user_blocks_likes_insert ON public.review_likes;
CREATE POLICY user_blocks_likes_insert ON public.review_likes AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT safety_private.review_author_blocked(review_id));

DROP POLICY IF EXISTS user_blocks_reviews_select ON public.reviews;
CREATE POLICY user_blocks_reviews_select ON public.reviews AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (NOT (user_id = ANY ((SELECT safety_private.blocked_ids())::uuid[])));

DROP POLICY IF EXISTS user_blocks_comments_select ON public.review_comments;
CREATE POLICY user_blocks_comments_select ON public.review_comments AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (NOT (user_id = ANY ((SELECT safety_private.blocked_ids())::uuid[])));

DROP POLICY IF EXISTS user_blocks_notifications_select ON public.notifications;
CREATE POLICY user_blocks_notifications_select ON public.notifications AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (actor_id IS NULL OR NOT (actor_id = ANY ((SELECT safety_private.blocked_ids())::uuid[])));

-- 4. Comment moderation: the review's creator may delete comments on it --------
-- (The author could already delete their own. The review is read under the caller's RLS: the creator always sees their own.)
DROP POLICY IF EXISTS user_blocks_comments_delete_by_review_owner ON public.review_comments;
CREATE POLICY user_blocks_comments_delete_by_review_owner ON public.review_comments
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_comments.review_id AND r.user_id = auth.uid()));

COMMIT;
