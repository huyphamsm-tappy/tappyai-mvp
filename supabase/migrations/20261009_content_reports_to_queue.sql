-- ============================================================================
-- App Review 1.2 (owner 09/10): a report about a POST / CLIP reaches the moderation queue when it is filed, with a priority.
--
-- BEFORE: `content_reports` rows reached `moderation_queue` only through `fn_ingest_moderation_reports()`, which runs once a day
-- (analytics-snapshot, 05:00 UTC) and gives every report priority 1 (72 h target, never "urgent"). A report on a clip could sit
-- unseen for a day and was never triaged by severity. Reports about comments and accounts already queue at once with a priority
-- (20261001d `user_report_to_queue`); this brings posts to the same standard.
--
-- WHAT THIS DOES: one AFTER INSERT trigger on `content_reports` that writes the SAME queue row the daily ingest would write
-- (same `metadata` shape, same `created_at`), plus a priority by reason. `uq_modq_source` (m09) makes the daily ingest a no-op for rows
-- already queued, so nothing is duplicated and the cron stays as a backstop. A report only ever creates a queue row: it removes,
-- hides and sanctions nothing (20261001d §1 keeps holding).
--
-- PRIORITY (mirrors user_report_to_queue; post reports carry only the seven canonical reasons — the route maps a native
-- sexual/sensitive onto `inappropriate` and self_harm onto `violence`, so those two are treated as severe):
--   3 (24 h)  violence, inappropriate         2 (72 h)  harassment, misinformation         1 (72 h)  spam, copyright, other
--
-- DEPENDS ON: 20260817 (content_reports), 20260821 (moderation_queue, uq_modq_source). Inert for existing rows.
-- ROLLBACK: rollback/20261009_content_reports_to_queue_rollback.sql.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.content_report_to_queue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_priority smallint;
BEGIN
  v_priority := CASE
    WHEN NEW.reason IN ('violence', 'inappropriate') THEN 3
    WHEN NEW.reason IN ('harassment', 'misinformation') THEN 2
    ELSE 1 END;
  INSERT INTO public.moderation_queue (type, status, priority, reported_by, target_type, target_id, reason, metadata, created_at)
  VALUES (
    'review_report'::moderation_type,
    'pending'::moderation_status,
    v_priority,
    NULL,                                   -- ADR-026: the reporter is opaque; only the one-way source id is kept
    'review',
    NEW.content_id,
    NEW.reason,
    jsonb_build_object(
      'source_table', 'content_reports',
      'source_id', NEW.id::text,
      'reporter_source_id', NEW.reporter_source_id,
      'policy_id', NEW.policy_id,
      'verification_state', NEW.verification_state),
    NEW.created_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.content_report_to_queue() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS content_report_to_queue ON public.content_reports;
CREATE TRIGGER content_report_to_queue AFTER INSERT ON public.content_reports FOR EACH ROW EXECUTE FUNCTION public.content_report_to_queue();

COMMIT;

-- VERIFICATION (read-only, after apply):
--   SELECT tgname FROM pg_trigger WHERE tgname = 'content_report_to_queue' AND NOT tgisinternal;      -- 1 row
--   SELECT to_regprocedure('public.content_report_to_queue()') IS NOT NULL;                           -- t
