-- ──────────────────────────────────────────────────────────────────────────────
-- user_preferences — extend existing table with typed preference columns
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS budget_min        integer     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS budget_max        integer     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_style   text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_tags      text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS disliked_tags     text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usual_party_size  integer     DEFAULT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- user_events — append-only behavioural log used for preference inference
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  place_id    uuid        DEFAULT NULL,
  review_id   uuid        DEFAULT NULL,
  metadata    jsonb       DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own events" ON public.user_events
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS user_events_user_created_idx
  ON public.user_events (user_id, created_at DESC);
