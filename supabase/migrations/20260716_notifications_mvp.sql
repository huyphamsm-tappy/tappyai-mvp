-- ============================================================================
-- Notification System MVP — Feature 1
-- ============================================================================
-- New, standalone table. Does NOT modify any existing table/trigger/policy.
-- Replaces the ad-hoc derived list in /api/notifications (which recomputed
-- "notifications" on every read from user_follows/review_likes, with no
-- persisted read state) with a real, persisted notifications table.
-- ============================================================================

-- Enum (not TEXT + CHECK). All six values are declared UP FRONT even though
-- only LIKE/COMMENT/FOLLOW are emitted by current code: Postgres's
-- `ALTER TYPE ... ADD VALUE` has transaction-block restrictions and can't be
-- used in the same transaction that adds it, so pre-declaring the planned
-- values makes shipping REPLY/MENTION/SYSTEM later a pure app-code change
-- with no migration at all. Wrapped in a DO block so re-running is safe
-- (CREATE TYPE has no IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('LIKE', 'COMMENT', 'FOLLOW', 'REPLY', 'MENTION', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
  -- Nullable: a SYSTEM notification (announcement, promo) has no human actor.
  actor_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type        public.notification_type NOT NULL,

  -- What the notification is about. Nullable for the same reason as actor_id
  -- (a SYSTEM notification may point at nothing in particular). No FK on
  -- entity_id: it's polymorphic across reviews/profiles/comments.
  entity_type TEXT CHECK (entity_type IN ('review', 'profile', 'comment')),
  entity_id   UUID,

  -- ── Presentation fields ──────────────────────────────────────────────────
  -- title/body are OPTIONAL and intentionally left NULL for LIKE/COMMENT/
  -- FOLLOW. Reason: this app is fully bilingual (vi/en, src/lib/i18n) and the
  -- reader's language is not knowable at write time — freezing "Huy da thich
  -- bai viet cua ban" into the row would show Vietnamese to an English reader
  -- forever, and would also freeze the actor's display name at write time (a
  -- later rename would leave old rows stale). So for those three types the UI
  -- keeps composing text from the i18n key + a live actor join, exactly as it
  -- does today, and `metadata` carries the structured extras it needs.
  -- title/body exist for types where text ISN'T derivable — SYSTEM
  -- announcements, marketing, anything human-authored — so those can ship with
  -- no schema change.
  title       TEXT,
  body        TEXT,
  image       TEXT,                                    -- e.g. review thumbnail
  action_url  TEXT NOT NULL,                           -- where tapping navigates
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,      -- structured extras (place_name, comment preview, ...)

  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Never notify yourself — enforced at the DB, not just in app code.
  -- IS DISTINCT FROM (not <>) so a NULL actor_id (SYSTEM) still passes.
  CONSTRAINT notifications_no_self_notify CHECK (user_id IS DISTINCT FROM actor_id)
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
-- type, about this exact entity is still UNREAD, a repeat of the same action
-- (unlike -> like again, a client double-submit) does not create a second row
-- — the unique index turns the insert into a no-op (23505) instead of spamming
-- the recipient. Once read, the same action can notify again (matches
-- TikTok/Instagram behavior). Rows with NULL actor_id/entity_id (SYSTEM) are
-- never deduped, since NULLs are distinct in a unique index — correct: two
-- separate announcements should both be delivered.
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
-- (see add_phase4_hardening.sql). Rather than writing a check that lets an
-- actor insert on a recipient's behalf (which a compromised client could then
-- abuse to forge notifications for anyone), inserts go exclusively through the
-- server's admin (service-role) client, which bypasses RLS. This policy makes
-- that explicit and blocks every other path.
DROP POLICY IF EXISTS "No direct client inserts" ON public.notifications;
CREATE POLICY "No direct client inserts"
  ON public.notifications FOR INSERT
  WITH CHECK (false);
