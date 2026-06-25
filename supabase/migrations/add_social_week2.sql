-- Phase 6 Week 2: Follow system + Comments
-- Run in Supabase SQL Editor

-- 1. user_follows table
CREATE TABLE IF NOT EXISTS public.user_follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read follows"
  ON public.user_follows FOR SELECT USING (true);

CREATE POLICY "Users can follow"
  ON public.user_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON public.user_follows FOR DELETE
  USING (auth.uid() = follower_id);

CREATE INDEX IF NOT EXISTS user_follows_follower_idx  ON public.user_follows (follower_id);
CREATE INDEX IF NOT EXISTS user_follows_following_idx ON public.user_follows (following_id);

-- 2. review_comments table
CREATE TABLE IF NOT EXISTS public.review_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments"
  ON public.review_comments FOR SELECT USING (true);

CREATE POLICY "Users can comment"
  ON public.review_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comment"
  ON public.review_comments FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS review_comments_review_id_idx ON public.review_comments (review_id, created_at);

-- 3. Add comment_count to reviews
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS comment_count integer DEFAULT 0;

-- 4. Trigger to keep comment_count in sync
CREATE OR REPLACE FUNCTION public.update_review_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET comment_count = comment_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_comment_count ON public.review_comments;
CREATE TRIGGER trg_review_comment_count
  AFTER INSERT OR DELETE ON public.review_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_review_comment_count();

-- 5. Add follower_count / following_count to profiles (denormalized for speed)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS follower_count  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0;

-- 6. Triggers to keep profile counts in sync
CREATE OR REPLACE FUNCTION public.update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET follower_count  = follower_count  + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_counts ON public.user_follows;
CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR DELETE ON public.user_follows
  FOR EACH ROW EXECUTE FUNCTION public.update_follow_counts();
