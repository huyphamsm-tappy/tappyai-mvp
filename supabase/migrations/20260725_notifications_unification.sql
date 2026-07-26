-- ADR-014 Notification Unification — Phase 0.
-- One persisted source of truth for Inbox + unread badge + device push, shared by
-- Web / Android / iOS. Replaces the derived GET /api/notifications aggregation and
-- the transient-only push path. Idempotent — safe to re-run.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- recipient
  type          TEXT NOT NULL,          -- 'like'|'comment'|'follow'|'milestone'|'deal'
                                         -- |'morning_brief'|'lunch'|'weekly'|'price'|'broadcast'|'system'
  category      TEXT NOT NULL,          -- 'social'|'deal'|'explore'|'system'
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  actor_id      UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,      -- social trigger
  entity_url    TEXT NULL,              -- deep link: /reviews/[id], /deals, /users/[id]
  image_url     TEXT NULL,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,

  read_at       TIMESTAMPTZ NULL,       -- server-side read state (ADR-014 #1)

  -- push delivery observability + retry (ADR-014 #6)
  push_status   TEXT NOT NULL DEFAULT 'pending'
                CHECK (push_status IN ('pending','sent','failed','skipped')),
  push_sent_at  TIMESTAMPTZ NULL,
  push_attempts INT NOT NULL DEFAULT 0,
  push_error    TEXT NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_push_retry_idx
  ON notifications (push_status) WHERE push_status = 'failed';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Recipient reads + updates (mark-read) OWN rows only. INSERT and push-status
-- writes go through the service-role client (server generators) which bypasses RLS,
-- so no INSERT policy is granted to end users — nothing client-side can mint a row.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_select_own') THEN
    CREATE POLICY "notifications_select_own" ON notifications
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_update_own') THEN
    -- Only the read_at / dismissal fields matter to the client; RLS scopes it to own rows.
    CREATE POLICY "notifications_update_own" ON notifications
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Clients subscribe to ONE channel on this table, filtered user_id=eq.<me>.
-- (INSERT + UPDATE carry the row; Realtime still enforces the SELECT RLS above per
-- subscriber, so a user only ever receives their own notifications.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- UPDATE events need the full old/new row for the client to react to read_at flips.
ALTER TABLE notifications REPLICA IDENTITY FULL;
