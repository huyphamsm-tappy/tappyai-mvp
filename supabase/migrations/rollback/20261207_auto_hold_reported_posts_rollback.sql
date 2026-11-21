-- Rollback for 20261207_auto_hold_reported_posts.sql. Posts already held stay held (a moderator lifts them from the queue as before).
BEGIN;
DROP TRIGGER IF EXISTS content_report_zz_auto_hold ON public.content_reports;
DROP FUNCTION IF EXISTS public.content_report_auto_hold();
COMMIT;
