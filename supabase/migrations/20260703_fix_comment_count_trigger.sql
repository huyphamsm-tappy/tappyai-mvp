-- Fix reviews.comment_count trigger drift for ordinary authenticated users.
--
-- Root cause: update_review_comment_count() (add_social_week2.sql) had no
-- SECURITY DEFINER, so it ran with the invoking user's privileges. reviews has
-- RLS enabled with no UPDATE policy at all (confirmed via pg_policies), so the
-- trigger's internal UPDATE affected 0 rows for real user actions — the
-- INSERT/DELETE on review_comments always succeeded, but reviews.comment_count
-- silently never changed. Confirmed empirically: a real user's comment left
-- review_comments with 1 row while reviews.comment_count stayed at 0.
--
-- Fix: add SECURITY DEFINER so the function runs as its owner (postgres, which
-- has BYPASSRLS = true — confirmed via pg_roles), letting the UPDATE bypass
-- the missing-policy gap. SET search_path = public pins the search path,
-- required whenever SECURITY DEFINER is used to avoid search-path hijacking.
--
-- Trigger (trg_review_comment_count, AFTER INSERT/DELETE ON review_comments)
-- is unchanged — CREATE OR REPLACE FUNCTION preserves the function's identity,
-- so the existing trigger binding continues to work without being recreated.
CREATE OR REPLACE FUNCTION public.update_review_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET comment_count = comment_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;
