-- Phase 1 User Memory Engine
-- Add structured preference profile cache to user_preferences
-- Safe to run multiple times

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS preference_profile   jsonb        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_updated_at   timestamptz  DEFAULT NULL;

-- Index for fast cache staleness checks
CREATE INDEX IF NOT EXISTS user_preferences_profile_updated_idx
  ON public.user_preferences (user_id, profile_updated_at DESC);
