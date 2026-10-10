-- Rollback for 20261010_content_reports_flood_guard.sql. Removes the flood guard, the reason / policy_id checks and the index; rows are untouched.
BEGIN;
DROP TRIGGER IF EXISTS content_report_flood_guard ON public.content_reports;
DROP FUNCTION IF EXISTS public.content_report_flood_guard();
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_reason_check;
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_policy_id_len;
DROP INDEX IF EXISTS public.content_reports_reporter_recent_idx;
COMMIT;
