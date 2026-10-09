-- Rollback for 20261009_content_reports_to_queue.sql. Queue rows already written stay (they are valid queue rows; the daily ingest would have written them anyway).
BEGIN;
DROP TRIGGER IF EXISTS content_report_to_queue ON public.content_reports;
DROP FUNCTION IF EXISTS public.content_report_to_queue();
COMMIT;
