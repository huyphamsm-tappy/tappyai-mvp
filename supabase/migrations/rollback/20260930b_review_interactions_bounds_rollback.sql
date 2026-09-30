-- Rollback for 20260930b_review_interactions_bounds.sql.
-- 🚨 Reopens the hole: an owner can again store any watch_seconds / completion_rate through
-- PostgREST and skew a clip's Explore ranking averages.
ALTER TABLE public.review_interactions DROP CONSTRAINT IF EXISTS review_interactions_watch_seconds_bounds;
ALTER TABLE public.review_interactions DROP CONSTRAINT IF EXISTS review_interactions_completion_rate_bounds;
