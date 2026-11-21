-- ============================================================================
-- Auto-hold of a reported post / clip (owner 21/11/2026: "nếu báo cáo nhiều lần thì hệ thống ẩn đi chứ, chúng ta sao mà ngồi canh được").
--
-- WHAT: when enough DIFFERENT people report the same post for the same kind of reason, the post is held (publication_state = 'RESTRICTED', hidden from everyone but its author) until a
-- moderator looks. Reports never delete anything: this is the same «hold» a moderator can already apply by hand, done by the database at the moment the threshold is reached.
--
-- THRESHOLDS (distinct reporters; one account is one reporter_source_id, and the table already refuses repeats and floods of 10 reports in 10 minutes):
--   severe  (violence, inappropriate) ........ 3 different reporters
--   harassment ............................... 5 different reporters
--   spam, copyright, misinformation, other ... never auto-held (a person decides; these reasons are the easiest to abuse)
-- These are Tappy's own starting values to tune on real data: TikTok and Meta publish no report count (both say mass reporting alone does not decide; they use risk scores and review queues).
--
-- SAFETY:
--   * Only a post that is visible (publication_state NULL or PUBLISHED) is touched. A post the safety gate or a moderator already restricted is left alone.
--   * ONE queue row of the post is moved to 'in_review' and marked metadata.auto_hold = true (priority raised to urgent): that row is what the existing decide route reads, so a "no violation"
--     verdict on ANY report of the post lifts the hold (route change in the same commit); a removal / restriction works as before.
--   * Reports filed BEFORE the latest "no violation" verdict do not count again: after a moderator clears a post, the same people cannot re-hide it; new reporters start from zero.
--   * The function only reads content_reports and writes reviews / moderation_queue; no client role may call it.
--
-- TRIGGER ORDER: AFTER INSERT triggers fire in name order; this one is named so that it runs AFTER content_report_to_queue (the queue row must exist first).
-- DEPENDS ON: 20260817, 20260821, 20261009. Inert for existing rows. ROLLBACK: rollback/20261207_auto_hold_reported_posts_rollback.sql.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.content_report_auto_hold() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_threshold integer;
  v_class     text[];
  v_since     timestamptz;
  v_distinct  integer;
  v_held      integer;
BEGIN
  IF NEW.reason IN ('violence', 'inappropriate') THEN
    v_threshold := 3; v_class := ARRAY['violence', 'inappropriate'];
  ELSIF NEW.reason = 'harassment' THEN
    v_threshold := 5; v_class := ARRAY['harassment'];
  ELSE
    RETURN NEW;
  END IF;

  -- reports before the latest "no violation" verdict on this post do not count again
  SELECT max(COALESCE(resolved_at, updated_at)) INTO v_since
    FROM public.moderation_queue
   WHERE target_type = 'review' AND target_id = NEW.content_id AND status = 'dismissed';

  SELECT count(DISTINCT reporter_source_id) INTO v_distinct
    FROM public.content_reports
   WHERE content_id = NEW.content_id AND reason = ANY (v_class)
     AND (v_since IS NULL OR created_at > v_since);
  IF v_distinct < v_threshold THEN RETURN NEW; END IF;

  UPDATE public.reviews SET publication_state = 'RESTRICTED'
   WHERE id = NEW.content_id AND (publication_state IS NULL OR publication_state = 'PUBLISHED');
  GET DIAGNOSTICS v_held = ROW_COUNT;

  IF v_held > 0 THEN
    UPDATE public.moderation_queue
       SET status = 'in_review', priority = GREATEST(priority, 3), updated_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('auto_hold', true)
     WHERE id = (SELECT id FROM public.moderation_queue
                  WHERE target_type = 'review' AND target_id = NEW.content_id AND status = 'pending'
                  ORDER BY created_at DESC LIMIT 1);
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.content_report_auto_hold() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS content_report_zz_auto_hold ON public.content_reports;
CREATE TRIGGER content_report_zz_auto_hold AFTER INSERT ON public.content_reports FOR EACH ROW EXECUTE FUNCTION public.content_report_auto_hold();

COMMIT;

-- VERIFICATION (read-only, after apply):
--   SELECT tgname FROM pg_trigger WHERE tgname = 'content_report_zz_auto_hold' AND NOT tgisinternal;   -- 1 row
