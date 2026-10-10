-- ============================================================================
-- App Review 1.2 (owner 10/10): a signed-in client cannot flood the report queue, and cannot store free text in `reason`.
--
-- WHY. 20260930 pins WHO may file (the caller's own opaque id) and which columns they may write, but not HOW MANY: one account can still file reports
-- against any number of different posts, one per (post, reason), straight through the REST API, which the route's own limits never see. Every
-- report becomes a moderation_queue row (20261009) and, through the route, an alert. `reason` is also free text at the database: the route only
-- sends the seven canonical reasons, but a direct client could store anything.
--
-- WHAT.
--   1. A BEFORE INSERT trigger refuses (SQLSTATE 53400, message 'report_rate_limited') a report when the same reporter_source_id already filed 10
--      in the last 10 minutes: the same ceiling the comment/user report route applies (`user_reports`). The count runs as the function owner
--      (the filing role has no SELECT on the table); an index keeps it cheap.
--   2. `reason` must be one of the seven canonical reasons, and `policy_id` at most 80 characters, for NEW rows only (NOT VALID: existing rows are
--      not scanned or rejected, so this cannot fail on old data).
-- Concurrency: reports from the SAME reporter are serialized by an advisory lock (see the function), so the ceiling of 10 holds exactly under a burst;
-- reports from different reporters do not wait for each other. The lock is held until the inserting transaction ends (a single INSERT: milliseconds).
--
-- DEPENDS ON: 20260817 (content_reports). Works with or without 20260930, but is meant to follow it.
-- GATE: applied to production ONLY under explicit Owner authorization, after the pg_dump. Inert for anyone filing fewer than 10 reports in 10 minutes.
-- ROLLBACK: rollback/20261010_content_reports_flood_guard_rollback.sql
-- ============================================================================
BEGIN;

CREATE INDEX IF NOT EXISTS content_reports_reporter_recent_idx ON public.content_reports (reporter_source_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.content_report_flood_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_recent integer;
BEGIN
  -- One reporter at a time: a transaction-level advisory lock keyed on the opaque reporter id, held until this transaction ends. Without it, three
  -- transactions that each see 9 committed reports all pass (measured in supabase/tests/content_reports_flood_guard_concurrency.test.ts: 12 rows).
  -- With it, the second report WAITS for the first to commit, then counts it. Other reporters hash to other keys and never wait for this one.
  PERFORM pg_advisory_xact_lock(hashtextextended('content_report:' || NEW.reporter_source_id, 0));
  SELECT count(*) INTO v_recent
    FROM public.content_reports c
   WHERE c.reporter_source_id = NEW.reporter_source_id
     AND c.created_at > now() - interval '10 minutes';
  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = '53400';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.content_report_flood_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS content_report_flood_guard ON public.content_reports;
CREATE TRIGGER content_report_flood_guard BEFORE INSERT ON public.content_reports FOR EACH ROW EXECUTE FUNCTION public.content_report_flood_guard();

ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_reason_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reason_check
  CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'copyright', 'misinformation', 'violence', 'other')) NOT VALID;
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_policy_id_len;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_policy_id_len
  CHECK (policy_id IS NULL OR char_length(policy_id) <= 80) NOT VALID;

COMMIT;

-- VERIFICATION (read-only, after apply):
--   SELECT tgname FROM pg_trigger WHERE tgname = 'content_report_flood_guard' AND NOT tgisinternal;      -- 1 row
--   SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'public.content_reports'::regclass AND conname IN ('content_reports_reason_check', 'content_reports_policy_id_len');   -- 2 rows, convalidated = f
