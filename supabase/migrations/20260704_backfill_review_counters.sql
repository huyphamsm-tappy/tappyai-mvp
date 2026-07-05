-- Backfill denormalized review counters to match their junction tables.
--
-- Why: before 20260703_fix_*_trigger.sql added SECURITY DEFINER, the
-- update_review_{like,save,comment}_count() triggers silently failed under RLS
-- for ordinary authenticated users, so like_count / save_count / comment_count
-- were NOT incremented for actions taken before the fix. New actions now count
-- correctly, but rows touched pre-fix remain undercounted (e.g. a like/save that
-- exists in review_likes / review_saves but was never reflected in the counter).
--
-- This one-time reconciliation recomputes each counter from the source-of-truth
-- junction tables. It is idempotent and safe to run once against production.
--
-- NOTE: run this AFTER the SECURITY DEFINER trigger fixes are in place, so the
-- counters stay correct going forward.

UPDATE reviews
SET like_count = (
  SELECT COUNT(*) FROM review_likes WHERE review_id = reviews.id
);

UPDATE reviews
SET save_count = (
  SELECT COUNT(*) FROM review_saves WHERE review_id = reviews.id
);

UPDATE reviews
SET comment_count = (
  SELECT COUNT(*) FROM review_comments WHERE review_id = reviews.id
);
