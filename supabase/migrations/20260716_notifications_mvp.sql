-- ============================================================================
-- Notification System MVP — Feature 1
-- ============================================================================
-- New, standalone table. Does NOT modify any existing table/trigger/policy.
-- Replaces the ad-hoc derived list in /api/notifications (which recomputed
-- "notifications" on every read from user_follows/review_likes/review_milestones,
-- with no persisted read state) with a real, persisted notifications table.
--
-- Types shipped in this MVP: LIKE, COMMENT, FOLLOW. The CHECK constraint is
-- intentionally a plain TEXT + CHECK (not a Postgres ENUM) so adding REPLY /
-- MENTION / SYSTEM later is a one-line ALTER, not a type migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
  actor_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- who did the action
  type        TEXT NOT NULL CHECK (type IN ('LIKE', 'COMMENT', 'FOLLOW')),
  -- Polymorphic target the notification is about — 'review' (LIKE/COMMENT,
  -- entity_id = reviews.id) or 'profile' (FOLLOW, entity_id = actor_id, i.e.
  -- where tapping the notification should navigate). No FK on entity_id since
  -- it can point at either table; see Technical Debt note in the PR report
  -- about orphaned rows if the target review is later deleted.
  entity_type TEXT NOT NULL CHECK (entity_type IN ('review', 'profile')),
  entity_id   UUID NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_no_self_notify CHECK (user_id <> actor_id)
);

-- Fast unread-count + unread-list queries (the two hottest reads: badge count,
-- and "show me what's new").
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = false;

-- Fast paginated "all notifications" list (read + unread).
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- Anti-duplicate: while a notification from this exact actor, of this exact
-- type, about this exact entity, is still UNREAD, a repeat of the same action
-- (e.g. unlike -> like again, or a client double-submit) does not create a
-- second row — the unique index makes the insert a no-op (23505) rather than
-- spamming the recipient. Once the user reads it, the same action can create
-- a fresh notification again (matches TikTok/Instagram behavior).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unread_dedup
  ON public.notifications (user_id, actor_id, type, entity_id)
  WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Notifications are private — only the recipient can ever read their own.
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Only the recipient can mark their own notifications read.
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No client-side INSERT policy: a notification's user_id (recipient) is
-- someone OTHER than auth.uid() (the actor) in every real case, so a
-- straightforward `auth.uid() = user_id` INSERT check can never pass for a
-- genuine notification — the same shape of problem review_milestones hit
-- (see add_phase4_hardening.sql). Rather than trying to write a check that
-- lets an actor insert on a recipient's behalf (which an anon/compromised
-- client could then abuse to forge notifications for anyone), inserts are
-- done exclusively via the server's admin (service-role) client, which
-- bypasses RLS entirely. This policy just makes that explicit and blocks
-- every other path.
DROP POLICY IF EXISTS "No direct client inserts" ON public.notifications;
CREATE POLICY "No direct client inserts"
  ON public.notifications FOR INSERT
  WITH CHECK (false);
