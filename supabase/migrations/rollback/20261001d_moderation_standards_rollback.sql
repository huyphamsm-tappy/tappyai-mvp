-- Rollback for 20261001d_moderation_standards.sql. The ledger and the appeals are DROPPED (their history is lost — export first if
-- any decision was made). moderation_queue / moderation_actions / account_status are untouched; sanctions already applied through
-- account_status stay in force until lifted from the admin Users screen.
BEGIN;
DROP TRIGGER IF EXISTS user_report_to_queue ON public.user_reports;
DROP FUNCTION IF EXISTS public.user_report_to_queue();
DROP FUNCTION IF EXISTS public.moderation_purge_snapshots(integer);
DROP TRIGGER IF EXISTS moderation_decisions_no_truncate ON public.moderation_decisions;
DROP TABLE IF EXISTS public.moderation_appeals;
DROP TABLE IF EXISTS public.moderation_decisions;
DROP FUNCTION IF EXISTS public.moderation_ledger_guard();
ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_reason_check;
UPDATE public.user_reports SET reason = 'other' WHERE reason = 'child_safety';
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_reason_check CHECK (reason IN (
  'spam', 'harassment', 'inappropriate', 'copyright', 'misinformation', 'violence', 'other',
  'scam', 'sensitive', 'hate', 'sexual', 'self_harm', 'impersonation'));
COMMIT;
