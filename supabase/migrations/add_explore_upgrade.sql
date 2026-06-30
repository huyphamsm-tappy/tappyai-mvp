-- Phase 1: Explore/Reviews upgrade
-- Run this migration in Supabase SQL Editor

-- 1. Extend reviews table with new columns
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'photo'
    CONSTRAINT reviews_content_type_check
    CHECK (content_type IN ('video', 'photo', 'text')),
  ADD COLUMN IF NOT EXISTS media_url       TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail       TEXT,
  ADD COLUMN IF NOT EXISTS hashtags        TEXT[],
  ADD COLUMN IF NOT EXISTS watch_time_avg  FLOAT   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_rate FLOAT   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS save_count      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type     TEXT    DEFAULT 'upload'
    CONSTRAINT reviews_source_type_check
    CHECK (source_type IN ('upload', 'youtube', 'tiktok', 'facebook')),
  ADD COLUMN IF NOT EXISTS source_url      TEXT;
-- score is NOT stored -- computed dynamically:
-- (5 + watch_time_avg*0.4 + save_count*0.3 + like_count*0.2 + comment_count*0.1)
-- * locationBoost * recencyBoost

-- 2. Sync save_count from review_saves trigger
CREATE OR REPLACE FUNCTION public.update_review_save_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET save_count = save_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_save_count ON public.review_saves;
CREATE TRIGGER trg_review_save_count
  AFTER INSERT OR DELETE ON public.review_saves
  FOR EACH ROW EXECUTE FUNCTION public.update_review_save_count();

-- 3. Interaction tracking table (watch time, completion rate)
CREATE TABLE IF NOT EXISTS public.review_interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id)   ON DELETE CASCADE,
  review_id       UUID REFERENCES public.reviews(id) ON DELETE CASCADE,
  watch_seconds   FLOAT DEFAULT 0,
  completion_rate FLOAT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, review_id)
);

ALTER TABLE public.review_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own interactions"
  ON public.review_interactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS reviews_hashtags_idx
  ON public.reviews USING GIN (hashtags);

CREATE INDEX IF NOT EXISTS reviews_visibility_idx
  ON public.reviews (is_hidden, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_content_type_idx
  ON public.reviews (content_type);

CREATE INDEX IF NOT EXISTS reviews_feed_score_idx
  ON public.reviews (like_count DESC, save_count DESC, created_at DESC);
