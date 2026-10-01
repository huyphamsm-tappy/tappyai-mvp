-- ============================================================================
-- Moderation standards (owner 01/10): reports enter the EXISTING moderation queue; reviewers decide against written
-- community rules; every decision goes into an IMMUTABLE ledger («sổ strike»); a person may appeal once per decision.
--
-- GATE: applied to production ONLY under explicit Owner authorization, AFTER 20261001_user_blocks.sql and
--       20261001b_user_reports.sql, after the pg_dump. Inert until MODERATION_ADMIN_ENABLED=true: nothing here changes what a
--       report does — a report only ever creates a queue row.
--
-- REUSED, NOT REWRITTEN (the release already has them): moderation_queue (20260821_m09), moderation_actions, account_status
-- (suspend / ban enforcement, read by the routes), audit_log (hash-chained), the admin RBAC. Phase 8's `reports` and
-- `account_sanctions` are NOT brought in: the ladder below projects onto account_status through the existing admin helpers.
--
-- WHAT IS NEW
--   1. user_reports.reason accepts 'child_safety' (a severe group the report menu needs).
--   2. Trigger: a new user_reports row → one moderation_queue row (priority by reason; a reporter whose reports are mostly
--      rejected goes last, never ignored).
--   3. moderation_decisions — the immutable ledger: who decided, when, which rule group, which feature, which penalty,
--      which content (id only; a body snapshot ONLY when a comment was removed, so an upheld appeal can restore it), the
--      reviewer's reason, when the strike stops counting.
--   4. moderation_appeals — one appeal per decision (UNIQUE), resolved once.
--
-- P8-4 (Phase 8 review): an append-only ledger whose guard also blocks the FOREIGN-KEY UPDATE that clears a deleted
-- account stops the account from ever being deleted. Here the guard explicitly ALLOWS exactly that transition
-- (subject_user_id / reviewer_id / queue_id / appellant_id / resolved_by → NULL, and purging the comment snapshot) and nothing else.
-- Account deletion therefore never fails because of a sanction, and what stays behind is anonymous.
--
-- Access: every table is service-role only (REVOKE from anon / authenticated, no policies). Clients read their own decisions
-- and report statuses through API routes that scope by the caller.
--
-- Rollback: rollback/20261001d_moderation_standards_rollback.sql
-- ============================================================================

BEGIN;

-- 1. the severe reason the menu needs ------------------------------------------------------------------------------------
ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_reason_check;
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_reason_check CHECK (reason IN (
  'spam', 'harassment', 'inappropriate', 'copyright', 'misinformation', 'violence', 'other',
  'scam', 'sensitive', 'hate', 'sexual', 'self_harm', 'impersonation', 'child_safety'));

-- 2. the ledger ----------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id         uuid REFERENCES public.moderation_queue(id) ON DELETE SET NULL,
  subject_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rule_group       text NOT NULL,
  feature          text NOT NULL,
  severity         smallint NOT NULL,
  outcome          text NOT NULL,
  strike           boolean NOT NULL,
  strike_expires_at timestamptz,
  restrict_days    integer,
  content_type     text,
  content_id       uuid,
  content_snapshot jsonb,
  reason           text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_decisions_group_check CHECK (rule_group IN ('spam', 'harassment', 'hate', 'sexual', 'violence_selfharm', 'scam_misinfo', 'impersonation', 'ip_privacy', 'illegal_goods', 'child_safety')),
  CONSTRAINT moderation_decisions_feature_check CHECK (feature IN ('post', 'comment', 'message', 'profile')),
  CONSTRAINT moderation_decisions_severity_check CHECK (severity BETWEEN 1 AND 3),
  CONSTRAINT moderation_decisions_outcome_check CHECK (outcome IN ('no_violation', 'warning', 'content_removed', 'restricted', 'banned')),
  CONSTRAINT moderation_decisions_strike_shape CHECK (
    strike = (outcome IN ('content_removed', 'restricted', 'banned'))
    AND (strike OR strike_expires_at IS NULL)
    AND (NOT strike OR severity = 3 OR strike_expires_at IS NOT NULL)
    AND (severity < 3 OR strike_expires_at IS NULL)),
  CONSTRAINT moderation_decisions_restrict_days CHECK ((outcome = 'restricted') = (restrict_days IS NOT NULL) AND (restrict_days IS NULL OR restrict_days BETWEEN 1 AND 365)),
  CONSTRAINT moderation_decisions_reason_len CHECK (char_length(reason) BETWEEN 10 AND 1000),
  CONSTRAINT moderation_decisions_snapshot_only_for_removal CHECK (content_snapshot IS NULL OR outcome = 'content_removed')
);
CREATE INDEX IF NOT EXISTS moderation_decisions_subject_idx ON public.moderation_decisions (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_decisions_queue_idx ON public.moderation_decisions (queue_id);
-- One final decision per queue item (a retry after a half-failed attempt must not double a strike).
CREATE UNIQUE INDEX IF NOT EXISTS moderation_decisions_one_per_queue ON public.moderation_decisions (queue_id) WHERE queue_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.moderation_appeals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id   uuid NOT NULL REFERENCES public.moderation_decisions(id),
  appellant_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source        text NOT NULL DEFAULT 'app',
  message       text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  same_reviewer boolean,
  resolution_note text,
  CONSTRAINT moderation_appeals_one_per_decision UNIQUE (decision_id),
  CONSTRAINT moderation_appeals_source_check CHECK (source IN ('app', 'email')),
  CONSTRAINT moderation_appeals_status_check CHECK (status IN ('pending', 'upheld', 'reversed')),
  CONSTRAINT moderation_appeals_message_len CHECK (char_length(message) BETWEEN 10 AND 1000),
  CONSTRAINT moderation_appeals_resolution_shape CHECK ((status = 'pending') = (resolved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS moderation_appeals_status_idx ON public.moderation_appeals (status, created_at);

-- Immutability. DELETE is never allowed. UPDATE may only (a) clear a deleted account's reference / purge the comment snapshot,
-- or (b) on an appeal, resolve it once.
CREATE OR REPLACE FUNCTION public.moderation_ledger_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  nulls text[] := ARRAY['subject_user_id', 'reviewer_id', 'queue_id', 'content_snapshot', 'appellant_id'];
  o jsonb; n jsonb; k text;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  IF TG_TABLE_NAME = 'moderation_appeals' AND (o ->> 'status') = 'pending' AND (n ->> 'status') IN ('upheld', 'reversed') THEN
    -- resolving: only the resolution fields may change (plus the null-only clean-ups)
    FOREACH k IN ARRAY ARRAY['status', 'resolved_by', 'resolved_at', 'same_reviewer', 'resolution_note'] LOOP
      o := o - k; n := n - k;
    END LOOP;
  END IF;
  -- the deleted-account clean-up: these columns may go from a value to NULL, never anywhere else
  FOREACH k IN ARRAY nulls LOOP
    IF n ? k AND (n -> k) IS DISTINCT FROM (o -> k) THEN
      IF (n -> k) <> 'null'::jsonb THEN RAISE EXCEPTION '%.% can only be cleared', TG_TABLE_NAME, k USING ERRCODE = '42501'; END IF;
      o := o - k; n := n - k;
    END IF;
  END LOOP;
  -- resolved_by on an appeal may also be cleared by a deleted reviewer
  IF TG_TABLE_NAME = 'moderation_appeals' AND (n ->> 'resolved_by') IS NULL AND (o ->> 'resolved_by') IS NOT NULL THEN o := o - 'resolved_by'; n := n - 'resolved_by'; END IF;
  IF o IS DISTINCT FROM n THEN
    RAISE EXCEPTION '% is append-only: only the deleted-account clean-up (and resolving an appeal once) may change a row', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.moderation_ledger_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS moderation_decisions_guard ON public.moderation_decisions;
CREATE TRIGGER moderation_decisions_guard BEFORE UPDATE OR DELETE ON public.moderation_decisions FOR EACH ROW EXECUTE FUNCTION public.moderation_ledger_guard();
DROP TRIGGER IF EXISTS moderation_appeals_guard ON public.moderation_appeals;
CREATE TRIGGER moderation_appeals_guard BEFORE UPDATE OR DELETE ON public.moderation_appeals FOR EACH ROW EXECUTE FUNCTION public.moderation_ledger_guard();
-- TRUNCATE is refused too.
DROP TRIGGER IF EXISTS moderation_decisions_no_truncate ON public.moderation_decisions;
CREATE TRIGGER moderation_decisions_no_truncate BEFORE TRUNCATE ON public.moderation_decisions FOR EACH STATEMENT EXECUTE FUNCTION public.moderation_ledger_guard();

ALTER TABLE public.moderation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.moderation_appeals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.moderation_decisions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.moderation_appeals TO service_role;

-- Retention: the comment snapshot exists only so an upheld appeal can restore the comment. Clearing it is the one allowed edit.
CREATE OR REPLACE FUNCTION public.moderation_purge_snapshots(p_older_than_days integer DEFAULT 60) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH purged AS (
    UPDATE public.moderation_decisions d SET content_snapshot = NULL
     WHERE d.content_snapshot IS NOT NULL
       AND d.created_at < now() - make_interval(days => GREATEST(p_older_than_days, 30))
       AND NOT EXISTS (SELECT 1 FROM public.moderation_appeals a WHERE a.decision_id = d.id AND a.status = 'pending')
    RETURNING 1)
  SELECT count(*)::int FROM purged
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_purge_snapshots(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_purge_snapshots(integer) TO service_role;

-- 3. a report enters the queue — and does nothing else ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_report_to_queue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_total int; v_dismissed int; v_priority smallint;
BEGIN
  v_priority := CASE
    WHEN NEW.reason IN ('child_safety', 'self_harm', 'violence', 'sexual') THEN 3
    WHEN NEW.reason IN ('hate', 'harassment', 'scam', 'impersonation', 'misinformation') THEN 2
    ELSE 1 END;
  -- Low-trust reporter: five or more earlier reports, 80%+ rejected → queued LAST (priority 0). Severe reasons are never demoted.
  IF NEW.reporter_id IS NOT NULL AND v_priority < 3 THEN
    SELECT count(*), count(*) FILTER (WHERE q.status = 'dismissed') INTO v_total, v_dismissed
      FROM public.moderation_queue q
     WHERE q.reported_by = NEW.reporter_id AND q.metadata ->> 'source_table' = 'user_reports';
    IF v_total >= 5 AND v_dismissed::numeric / v_total >= 0.8 THEN v_priority := 0; END IF;
  END IF;
  INSERT INTO public.moderation_queue (type, status, priority, reported_by, target_type, target_id, reason, metadata)
  VALUES (
    CASE NEW.target_type WHEN 'comment' THEN 'comment_report'::moderation_type ELSE 'user_report'::moderation_type END,
    'pending'::moderation_status,
    v_priority,
    (SELECT p.id FROM public.profiles p WHERE p.id = NEW.reporter_id),
    NEW.target_type,
    NEW.target_id,
    NEW.reason,
    jsonb_build_object('source_table', 'user_reports', 'source_id', NEW.id::text, 'details', NEW.note))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.user_report_to_queue() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_report_to_queue ON public.user_reports;
CREATE TRIGGER user_report_to_queue AFTER INSERT ON public.user_reports FOR EACH ROW EXECUTE FUNCTION public.user_report_to_queue();

COMMIT;
