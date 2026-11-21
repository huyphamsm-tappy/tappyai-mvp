-- ============================================================================
-- Hiding a comment (owner 21/11/2026: "duyệt" - two layers, like Facebook):
--   1. the OWNER of a post can hide a comment under their own post (immediate, reversible by them);
--   2. enough DIFFERENT people reporting a comment hide it by themselves until a moderator looks (same idea as the auto-hold of a post, 20261207).
--
-- WHAT IS NEW
--   * review_comments.hidden_at / hidden_by ('owner' | 'auto' | 'moderator'). A hidden comment is NOT deleted.
--   * A RESTRICTIVE read policy: a hidden comment is readable only by its own author, by the owner of the post, and by moderators. Everyone else gets nothing, even straight through the REST API.
--   * Trigger on user_reports (AFTER INSERT, comment targets): auto-hide at 3 different reporters for a severe reason (inappropriate, violence, sensitive, hate, sexual, self_harm,
--     child_safety) or 5 for harassment; scam, spam, copyright, misinformation, impersonation and other never auto-hide. Reports filed before the latest "no violation" verdict on that
--     comment do not count again. One queue row of the comment is moved to 'in_review' and marked metadata.auto_hold = true: a "no violation" verdict lifts the hold (decide route).
--   * The trigger only reads user_reports and writes review_comments / moderation_queue; no client role may call it.
-- DEPENDS ON: 20260928c (review_comments_publication_boundary, is_content_moderator), 20261001b/d (user_reports + queue trigger). Additive. ROLLBACK: rollback/20261208_comment_hiding_rollback.sql.
-- ============================================================================
BEGIN;

ALTER TABLE public.review_comments ADD COLUMN IF NOT EXISTS hidden_at timestamptz NULL;
ALTER TABLE public.review_comments ADD COLUMN IF NOT EXISTS hidden_by text NULL;
ALTER TABLE public.review_comments DROP CONSTRAINT IF EXISTS review_comments_hidden_by_check;
ALTER TABLE public.review_comments ADD CONSTRAINT review_comments_hidden_by_check CHECK (hidden_by IS NULL OR hidden_by IN ('owner', 'auto', 'moderator'));
CREATE INDEX IF NOT EXISTS review_comments_hidden_idx ON public.review_comments (review_id) WHERE hidden_at IS NOT NULL;

-- May the caller see a HIDDEN comment? Its author, the owner of the post, a moderator. (SECURITY DEFINER: the owner check reads reviews whatever the caller's own row policies say.)
CREATE OR REPLACE FUNCTION public.review_comment_visible(p_hidden_at timestamptz, p_user_id uuid, p_review_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_hidden_at IS NULL
      OR (auth.uid() IS NOT NULL AND (
            p_user_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = p_review_id AND r.user_id = auth.uid())
            OR public.is_content_moderator()))
$$;
REVOKE ALL ON FUNCTION public.review_comment_visible(timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_comment_visible(timestamptz, uuid, uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS review_comments_hidden_boundary ON public.review_comments;
CREATE POLICY review_comments_hidden_boundary
  ON public.review_comments
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (public.review_comment_visible(hidden_at, user_id, review_id));

-- Auto-hide on reports of a comment -------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_report_comment_auto_hold() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_threshold integer;
  v_class     text[];
  v_since     timestamptz;
  v_distinct  integer;
  v_hid       integer;
BEGIN
  IF NEW.target_type <> 'comment' THEN RETURN NEW; END IF;
  IF NEW.reason IN ('inappropriate', 'violence', 'sensitive', 'hate', 'sexual', 'self_harm', 'child_safety') THEN
    v_threshold := 3; v_class := ARRAY['inappropriate', 'violence', 'sensitive', 'hate', 'sexual', 'self_harm', 'child_safety'];
  ELSIF NEW.reason = 'harassment' THEN
    v_threshold := 5; v_class := ARRAY['harassment'];
  ELSE
    RETURN NEW;
  END IF;

  SELECT max(COALESCE(resolved_at, updated_at)) INTO v_since
    FROM public.moderation_queue
   WHERE target_type = 'comment' AND target_id = NEW.target_id AND status = 'dismissed';

  SELECT count(DISTINCT reporter_id) INTO v_distinct
    FROM public.user_reports
   WHERE target_type = 'comment' AND target_id = NEW.target_id AND reason = ANY (v_class)
     AND reporter_id IS NOT NULL AND (v_since IS NULL OR created_at > v_since);
  IF v_distinct < v_threshold THEN RETURN NEW; END IF;

  UPDATE public.review_comments SET hidden_at = now(), hidden_by = 'auto'
   WHERE id = NEW.target_id AND hidden_at IS NULL;
  GET DIAGNOSTICS v_hid = ROW_COUNT;

  IF v_hid > 0 THEN
    UPDATE public.moderation_queue
       SET status = 'in_review', priority = GREATEST(priority, 3), updated_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('auto_hold', true)
     WHERE id = (SELECT id FROM public.moderation_queue
                  WHERE target_type = 'comment' AND target_id = NEW.target_id AND status = 'pending'
                  ORDER BY created_at DESC LIMIT 1);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.user_report_comment_auto_hold() FROM PUBLIC, anon, authenticated;
-- named to fire AFTER user_report_to_queue (AFTER triggers fire in name order): the queue row must exist first
DROP TRIGGER IF EXISTS user_report_zz_comment_auto_hold ON public.user_reports;
CREATE TRIGGER user_report_zz_comment_auto_hold AFTER INSERT ON public.user_reports FOR EACH ROW EXECUTE FUNCTION public.user_report_comment_auto_hold();

COMMIT;

-- VERIFICATION (read-only, after apply):
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'review_comments' AND column_name IN ('hidden_at', 'hidden_by');   -- 2 rows
--   SELECT tgname FROM pg_trigger WHERE tgname = 'user_report_zz_comment_auto_hold' AND NOT tgisinternal;                                    -- 1 row
