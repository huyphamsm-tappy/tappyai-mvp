-- ---------------------------------------------------------------------------
-- security audit 2026-09-30 · watch-time rows stay within what a real view can produce
--
-- GATE: applied to production ONLY under explicit Owner authorization. No code dependency.
--
-- WHY. POST /api/reviews/[id]/interact clamps watch_seconds to [0, 86400] and completion_rate to
-- [0, 1] before writing, but "Users manage own interactions" (FOR ALL, auth.uid() = user_id) lets
-- the owner write their row straight through PostgREST with any value, and the authenticated role
-- may then call sync_review_watch_stats(), which averages those rows into reviews.watch_time_avg /
-- completion_rate — the Explore ranking inputs. One account writing completion_rate = 1e9 moves a
-- clip's average by orders of magnitude.
--
-- WHAT. The same bounds the route applies, as CHECK constraints. NOT VALID: rows already stored are
-- not re-checked (nothing is rewritten or locked for long); every new or updated row is. NaN and
-- Infinity fail the check. Validate later, once existing rows are known clean:
--   ALTER TABLE public.review_interactions VALIDATE CONSTRAINT review_interactions_watch_seconds_bounds;
--   ALTER TABLE public.review_interactions VALIDATE CONSTRAINT review_interactions_completion_rate_bounds;
--
-- Idempotent. Rollback: rollback/20260930b_review_interactions_bounds_rollback.sql
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.review_interactions') IS NULL THEN
    RAISE EXCEPTION 'review_interactions_bounds: public.review_interactions is missing (add_explore_upgrade.sql not applied)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_interactions_watch_seconds_bounds') THEN
    ALTER TABLE public.review_interactions
      ADD CONSTRAINT review_interactions_watch_seconds_bounds CHECK (watch_seconds >= 0 AND watch_seconds <= 86400) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_interactions_completion_rate_bounds') THEN
    ALTER TABLE public.review_interactions
      ADD CONSTRAINT review_interactions_completion_rate_bounds CHECK (completion_rate >= 0 AND completion_rate <= 1) NOT VALID;
  END IF;
END $$;
