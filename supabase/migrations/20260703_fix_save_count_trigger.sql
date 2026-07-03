-- Fix reviews.save_count trigger drift for ordinary authenticated users.
--
-- Root cause: update_review_save_count() (add_explore_upgrade.sql) had no
-- SECURITY DEFINER, so it ran with the invoking user's privileges. reviews has
-- RLS enabled with no UPDATE policy (until the companion migration adds one),
-- so the trigger's internal UPDATE affected 0 rows for real user actions.
--
-- Fix: add SECURITY DEFINER so the function runs as its owner (postgres, which
-- has BYPASSRLS = true), letting the UPDATE succeed regardless of RLS policies.
-- SET search_path = public pins the search path to avoid search-path hijacking.
--
-- Trigger (trg_review_save_count, AFTER INSERT/DELETE ON review_saves) is
-- unchanged — CREATE OR REPLACE preserves the function's identity.
CREATE OR REPLACE FUNCTION public.update_review_save_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET save_count = save_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;
