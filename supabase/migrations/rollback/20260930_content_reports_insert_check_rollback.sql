-- Rollback for 20260930_content_reports_insert_check.sql.
-- 🚨 Reopens the hole: a signed-in user can again insert content_reports rows through PostgREST
-- with any reporter_source_id, verification_state 'VERIFIED' and any status.
DROP POLICY IF EXISTS "Users can file a content report" ON public.content_reports;
CREATE POLICY "Users can file a content report"
  ON public.content_reports FOR INSERT TO authenticated
  WITH CHECK (true);
GRANT INSERT ON TABLE public.content_reports TO anon, authenticated;
