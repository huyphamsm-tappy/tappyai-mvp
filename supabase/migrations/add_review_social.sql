-- Phase 6: Social review features
-- Run in Supabase SQL Editor

-- 1. Add is_verified and like_count to reviews
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0;

-- 2. review_likes table
CREATE TABLE IF NOT EXISTS public.review_likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (review_id, user_id)
);

-- 3. RLS on review_likes
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read likes"
  ON public.review_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can like"
  ON public.review_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike"
  ON public.review_likes FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Trigger to keep like_count in sync
CREATE OR REPLACE FUNCTION public.update_review_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET like_count = like_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_like_count ON public.review_likes;
CREATE TRIGGER trg_review_like_count
  AFTER INSERT OR DELETE ON public.review_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_review_like_count();

-- 5. Index for feed query performance
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON public.reviews (created_at DESC);
CREATE INDEX IF NOT EXISTS review_likes_review_id_idx ON public.review_likes (review_id);
CREATE INDEX IF NOT EXISTS review_likes_user_id_idx ON public.review_likes (user_id);
