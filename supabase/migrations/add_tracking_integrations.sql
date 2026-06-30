-- Phase 7: In-app behavior tracking + third-party integrations
-- Run in Supabase SQL Editor

-- 1. user_events — lightweight event log
CREATE TABLE IF NOT EXISTS public.user_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text NOT NULL,  -- 'page_view','chat_search','category_click','place_save','review_view','deal_click'
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own events"
  ON public.user_events FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own events"
  ON public.user_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_events_user_id_idx   ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_type_idx      ON public.user_events (event_type);

-- 2. user_integrations — store OAuth tokens for third-party services
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider       text NOT NULL,  -- 'google_calendar', 'zalo'
  access_token   text,           -- encrypted at rest via Supabase Vault ideally; store here for MVP
  refresh_token  text,
  expires_at     timestamptz,
  scope          text,
  provider_user_id text,
  metadata       jsonb DEFAULT '{}',  -- e.g. {email, name, avatar, phone}
  connected_at   timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integrations"
  ON public.user_integrations FOR ALL USING (auth.uid() = user_id);

-- 3. Add behavior_summary to user_memory (populated by weekly rollup)
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS behavior_summary text;  -- e.g. "hay tìm quán cà phê buổi sáng, thường dùng app tối"
