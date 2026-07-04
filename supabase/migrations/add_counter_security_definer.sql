-- ============================================================================
-- Counter integrity hardening — SECURITY DEFINER for denormalized counters
-- ============================================================================
-- Root cause (Bugs #3, #4, comment_count):
--   The counter-sync trigger functions and the watch-stats UPDATE run inside a
--   normal authenticated user's session. Their internal
--   `UPDATE public.profiles/reviews SET <counter> = ...` is therefore subject to
--   RLS. There is no RLS UPDATE policy letting an ordinary user modify *other*
--   users' profile/review rows (correctly — you must not edit someone else's
--   profile), so the UPDATE silently affects 0 rows (RLS filters, it does not
--   error). Result:
--     * profiles.follower_count / following_count never move   (Bug #3)
--     * reviews.comment_count never moves for real user comments
--     * reviews.watch_time_avg / completion_rate never move    (Bug #4)
--
-- Fix: run the counter writes with the function owner's privileges
--   (SECURITY DEFINER), bypassing RLS — the same pattern already used by the
--   working `increment_review_view` RPC. `SET search_path = public` pins the
--   schema so a definer function can't be hijacked by a caller's search_path.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + a one-time backfill that recomputes
--   every counter from the source-of-truth rows. Safe to re-run.
-- ============================================================================

-- 1. Comment count trigger --------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_review_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET comment_count = comment_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 2. Follow counts trigger (Bug #3) -----------------------------------------
CREATE OR REPLACE FUNCTION public.update_follow_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET follower_count  = follower_count  + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 3. Watch-stats sync (Bug #4) ----------------------------------------------
-- Replaces the route's user-scoped `reviews.update({watch_time_avg,...})` which
-- RLS silently dropped. Recomputes both averages from review_interactions and
-- writes them with definer privileges.
CREATE OR REPLACE FUNCTION public.sync_review_watch_stats(p_review_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.reviews r SET
    watch_time_avg = COALESCE(
      (SELECT round(avg(watch_seconds)::numeric, 1)
         FROM public.review_interactions WHERE review_id = p_review_id), 0),
    completion_rate = COALESCE(
      (SELECT round(avg(completion_rate)::numeric, 3)
         FROM public.review_interactions WHERE review_id = p_review_id), 0)
  WHERE r.id = p_review_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_review_watch_stats(uuid) TO authenticated;

-- 4. One-time backfill — recompute every counter from source-of-truth --------
UPDATE public.reviews r
SET comment_count = COALESCE(
  (SELECT count(*) FROM public.review_comments c WHERE c.review_id = r.id), 0);

UPDATE public.profiles p
SET following_count = COALESCE(
      (SELECT count(*) FROM public.user_follows f WHERE f.follower_id = p.id), 0),
    follower_count  = COALESCE(
      (SELECT count(*) FROM public.user_follows f WHERE f.following_id = p.id), 0);

UPDATE public.reviews r
SET watch_time_avg = COALESCE(
      (SELECT round(avg(watch_seconds)::numeric, 1)
         FROM public.review_interactions i WHERE i.review_id = r.id), 0),
    completion_rate = COALESCE(
      (SELECT round(avg(completion_rate)::numeric, 3)
         FROM public.review_interactions i WHERE i.review_id = r.id), 0);
