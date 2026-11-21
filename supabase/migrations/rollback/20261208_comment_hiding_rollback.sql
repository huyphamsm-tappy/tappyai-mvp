-- Rollback for 20261208_comment_hiding.sql. Hidden comments become visible again (the columns are dropped); run only if that is intended.
BEGIN;
DROP TRIGGER IF EXISTS user_report_zz_comment_auto_hold ON public.user_reports;
DROP FUNCTION IF EXISTS public.user_report_comment_auto_hold();
DROP POLICY IF EXISTS review_comments_hidden_boundary ON public.review_comments;
DROP FUNCTION IF EXISTS public.review_comment_visible(timestamptz, uuid, uuid);
DROP INDEX IF EXISTS public.review_comments_hidden_idx;
ALTER TABLE public.review_comments DROP CONSTRAINT IF EXISTS review_comments_hidden_by_check;
ALTER TABLE public.review_comments DROP COLUMN IF EXISTS hidden_by;
ALTER TABLE public.review_comments DROP COLUMN IF EXISTS hidden_at;
COMMIT;
