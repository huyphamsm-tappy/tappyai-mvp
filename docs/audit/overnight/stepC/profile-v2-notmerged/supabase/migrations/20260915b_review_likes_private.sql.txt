-- ============================================================================
-- review_likes: the per-user liked collection becomes PRIVATE
-- ============================================================================
-- Explore Public Profile V2 privacy hardening (2026-09-15).
--
-- THE PROBLEM
--   `add_review_social.sql` gave `review_likes` a SELECT policy of `USING (true)`.
--   Measured on production with the public anon key: `?user_id=eq.<someone>`
--   returns that person's whole liked-content collection. The product treats
--   "Đã thích" as the owner's private tab; the database did not agree.
--
-- TWO QUESTIONS, TWO PRIVACY REQUIREMENTS
--   A. "Which reviews did THIS USER like?"  — private, owner-only.  → table policy
--   B. "Who likes THIS PUBLIC REVIEW?"      — public per clip (the like list a
--      visitor opens from the ❤️ count, and the 24h "hot places" panel on
--      Explore)                              → two narrow SECURITY DEFINER reads
--
-- The table policy answers A. It also closes every direct PostgREST path to B,
-- so B is re-opened ONLY through functions that take a review (or nothing) as
-- input and can never be asked "everything user X liked":
--   · review_likers(review, limit, before)  — rows of ONE review that the caller
--     may read (not hidden; published, or the caller is its author); columns
--     user_id + created_at only, capped at 50.
--   · hot_places_24h(limit)                 — place names with their like count
--     over the last 24h, visible reviews only; no user id in the output.
--
-- Nothing else read across users: `like_count` is trigger-maintained
-- (SECURITY DEFINER since 20260703); the feed, /mine, the single-review read,
-- the profile tabs and the preference collector all read `user_id = auth.uid()`;
-- the notifications backfill uses the service role. Realtime has no
-- `review_likes` subscriber in the app.
--
-- WHY SECURITY DEFINER: a function that runs as the caller is subject to the
-- very policy this file introduces, so it would answer B with only the caller's
-- own rows. The definer runs as the table owner; the visibility check is done
-- inside the function against `reviews` explicitly, because the definer also
-- bypasses the reviews policies. `auth.uid()` is the caller's claim regardless
-- of the executing role, so "the author may see their own held clip's likes"
-- holds exactly as in the single-review route.
--
-- ADR-019: both functions are declared closed, then granted to anon and
-- authenticated — the like list and the hot panel are readable signed-out today
-- and stay so. Registered as intentional anon grants in
-- scripts/architecture/check-sql-grants.mjs.
--
-- Idempotent. Owner applies via Dashboard → SQL Editor.
-- ============================================================================

-- ── A. The collection is the owner's ─────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read likes" ON public.review_likes;
DROP POLICY IF EXISTS review_likes_select_own ON public.review_likes;
CREATE POLICY review_likes_select_own ON public.review_likes
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON POLICY review_likes_select_own ON public.review_likes IS
  'A like row is readable only by the user who made it. Per-review reads go through review_likers() / hot_places_24h().';

-- ── B1. Who likes this review ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_likers(
  p_review_id UUID,
  p_limit     INTEGER DEFAULT 30,
  p_before    TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (user_id UUID, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT l.user_id, l.created_at
  FROM public.review_likes l
  WHERE l.review_id = p_review_id
    AND (p_before IS NULL OR l.created_at < p_before)
    -- The review itself must be readable by the caller: the same gate as
    -- GET /api/reviews/[id] — not hidden, and published unless the caller wrote it.
    AND EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.id = p_review_id
        AND COALESCE(r.is_hidden, false) = false
        AND (r.publication_state IS NULL OR r.publication_state = 'PUBLISHED' OR r.user_id = auth.uid())
    )
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50)
$$;

COMMENT ON FUNCTION public.review_likers(UUID, INTEGER, TIMESTAMPTZ) IS
  'Likers of ONE readable review (user_id, created_at), newest first, max 50. SECURITY DEFINER because review_likes is owner-read; the review visibility gate is enforced inside.';

REVOKE EXECUTE ON FUNCTION public.review_likers(UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.review_likers(UUID, INTEGER, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- ── B2. Hot places (24h) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hot_places_24h(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (place_name TEXT, like_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT r.place_name, COUNT(*)::BIGINT AS like_count
  FROM public.review_likes l
  JOIN public.reviews r ON r.id = l.review_id
  WHERE l.created_at >= now() - INTERVAL '24 hours'
    AND r.place_name IS NOT NULL
    AND COALESCE(r.is_hidden, false) = false
    AND (r.publication_state IS NULL OR r.publication_state = 'PUBLISHED')
  GROUP BY r.place_name
  ORDER BY like_count DESC, r.place_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20)
$$;

COMMENT ON FUNCTION public.hot_places_24h(INTEGER) IS
  'Place names most liked in the last 24h over visible reviews, with counts; no user ids. SECURITY DEFINER because review_likes is owner-read.';

REVOKE EXECUTE ON FUNCTION public.hot_places_24h(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.hot_places_24h(INTEGER) TO anon, authenticated, service_role;

-- Verify (read-only):
--   SELECT policyname, qual FROM pg_policies WHERE tablename = 'review_likes' AND cmd = 'SELECT';
--     → one row: review_likes_select_own, (auth.uid() = user_id)
--   SELECT has_function_privilege('anon', 'public.review_likers(uuid,integer,timestamptz)', 'EXECUTE'),
--          has_function_privilege('anon', 'public.hot_places_24h(integer)', 'EXECUTE');
--     → true, true
