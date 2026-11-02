-- ============================================================================
-- Reports of COMMENTS and USERS (owner 01/10) — a small table of its own. content_reports is NOT changed: its
-- content_id is a FK to reviews(id) and the moderation queue reads it; both stay exactly as they are.
--
-- GATE: applied to production ONLY under explicit Owner authorization, in the same group as 20261001_user_blocks.sql
--       (after it), after the pg_dump. Inert until REPORTS_ENABLED=true: the table is written only by the two routes.
--
-- What a report is: one row per (reporter, target). The reporter can READ only their own rows; nobody else can read anything (no
-- policy for it). NO client role can INSERT, UPDATE or DELETE: the two report routes are the only writers (service role), after they have
-- checked the session (not anonymous), the target (exists, not yours) and a persistent rate limit. A direct REST insert therefore cannot
-- bury the moderation queue with invented targets (security review 02/10).
--
-- Account deletion (decision recorded, Owner may change):
--   - the REPORTER is deleted  -> reporter_id becomes NULL (ON DELETE SET NULL): the report stays as moderation evidence,
--                                 anonymous, and the reporter's link to it is gone.
--   - the TARGET is deleted    -> the row stays (no FK on purpose: target_id points at a comment OR a user). It holds a
--                                 uuid, a reason and an optional <=300-char note by someone else — no profile data of
--                                 the deleted account. The alternative (purge reports about a deleted target) is a one-line
--                                 trigger; say so if wanted.
--
-- Moderation queue: the existing queue (admin/moderation, moderationService) reads content_reports only. This table is read
-- with the service role; wiring it into the admin queue is NOT part of this slice and no sanction logic is created here.
--
-- Rollback: rollback/20261001b_user_reports_rollback.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  reason      text NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_target_type_check CHECK (target_type IN ('comment', 'user')),
  CONSTRAINT user_reports_reason_check CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'copyright', 'misinformation', 'violence', 'other',
    -- sent by the native apps' own menus (stored as sent): Android scam/sensitive, iOS hate/sexual/self_harm/scam/impersonation
    'scam', 'sensitive', 'hate', 'sexual', 'self_harm', 'impersonation')),
  CONSTRAINT user_reports_note_len CHECK (note IS NULL OR char_length(note) <= 300),
  CONSTRAINT user_reports_not_self_user CHECK (target_type <> 'user' OR target_id IS DISTINCT FROM reporter_id),
  CONSTRAINT user_reports_one_per_target UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS user_reports_target_idx ON public.user_reports (target_type, target_id);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_reports_select_own ON public.user_reports;
DROP POLICY IF EXISTS user_reports_insert_own ON public.user_reports; -- (a draft had one; it never ships)
CREATE POLICY user_reports_select_own ON public.user_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());

REVOKE ALL ON TABLE public.user_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_reports TO authenticated;
GRANT ALL ON TABLE public.user_reports TO service_role;

COMMIT;
