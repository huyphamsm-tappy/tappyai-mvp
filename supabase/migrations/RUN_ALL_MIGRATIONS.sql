-- ============================================================
-- TappyAI: Chạy toàn bộ migration này trong Supabase SQL Editor
-- Ctrl+A để chọn hết → Ctrl+C → paste vào SQL Editor → Run
-- ============================================================

-- FILE 1: add_price_watches
CREATE TABLE IF NOT EXISTS public.price_watches (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_name  text        NOT NULL,
  target_price  bigint      NOT NULL,
  current_price bigint,
  search_query  text        NOT NULL,
  status        text        DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'cancelled')),
  notified_at   timestamptz,
  last_checked  timestamptz,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.price_watches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='price_watches' AND policyname='Users manage own price watches') THEN
    CREATE POLICY "Users manage own price watches" ON public.price_watches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS price_watches_status_idx ON public.price_watches (status) WHERE status = 'active';

-- FILE 2: add_memory_columns
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS companions  text,
  ADD COLUMN IF NOT EXISTS timing      text,
  ADD COLUMN IF NOT EXISTS personality text;
CREATE INDEX IF NOT EXISTS user_memory_user_id_idx ON public.user_memory (user_id);

-- FILE 3: add_review_social
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.review_likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (review_id, user_id)
);
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='review_likes' AND policyname='Anyone can read likes') THEN
    CREATE POLICY "Anyone can read likes" ON public.review_likes FOR SELECT USING (true);
    CREATE POLICY "Users can like" ON public.review_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can unlike" ON public.review_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.update_review_like_count() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.reviews SET like_count = like_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.reviews SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.review_id;
  END IF; RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_review_like_count ON public.review_likes;
CREATE TRIGGER trg_review_like_count AFTER INSERT OR DELETE ON public.review_likes FOR EACH ROW EXECUTE FUNCTION public.update_review_like_count();
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON public.reviews (created_at DESC);
CREATE INDEX IF NOT EXISTS review_likes_review_id_idx ON public.review_likes (review_id);
CREATE INDEX IF NOT EXISTS review_likes_user_id_idx ON public.review_likes (user_id);

-- FILE 4: add_social_week2
CREATE TABLE IF NOT EXISTS public.user_follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_follows' AND policyname='Anyone can read follows') THEN
    CREATE POLICY "Anyone can read follows" ON public.user_follows FOR SELECT USING (true);
    CREATE POLICY "Users can follow" ON public.user_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
    CREATE POLICY "Users can unfollow" ON public.user_follows FOR DELETE USING (auth.uid() = follower_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS user_follows_follower_idx  ON public.user_follows (follower_id);
CREATE INDEX IF NOT EXISTS user_follows_following_idx ON public.user_follows (following_id);
CREATE TABLE IF NOT EXISTS public.review_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='review_comments' AND policyname='Anyone can read comments') THEN
    CREATE POLICY "Anyone can read comments" ON public.review_comments FOR SELECT USING (true);
    CREATE POLICY "Users can comment" ON public.review_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can delete own comment" ON public.review_comments FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS review_comments_review_id_idx ON public.review_comments (review_id, created_at);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS comment_count integer DEFAULT 0;
CREATE OR REPLACE FUNCTION public.update_review_comment_count() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.reviews SET comment_count = comment_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.reviews SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.review_id;
  END IF; RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_review_comment_count ON public.review_comments;
CREATE TRIGGER trg_review_comment_count AFTER INSERT OR DELETE ON public.review_comments FOR EACH ROW EXECUTE FUNCTION public.update_review_comment_count();
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS follower_count  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0;
CREATE OR REPLACE FUNCTION public.update_follow_counts() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET follower_count  = follower_count  + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.following_id;
  END IF; RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_follow_counts ON public.user_follows;
CREATE TRIGGER trg_follow_counts AFTER INSERT OR DELETE ON public.user_follows FOR EACH ROW EXECUTE FUNCTION public.update_follow_counts();

-- FILE 5: add_tracking_integrations
CREATE TABLE IF NOT EXISTS public.user_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_events' AND policyname='Users read own events') THEN
    CREATE POLICY "Users read own events" ON public.user_events FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Users insert own events" ON public.user_events FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS user_events_user_id_idx ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_type_idx ON public.user_events (event_type);
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  access_token     text,
  refresh_token    text,
  expires_at       timestamptz,
  scope            text,
  provider_user_id text,
  metadata         jsonb DEFAULT '{}',
  connected_at     timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_integrations' AND policyname='Users manage own integrations') THEN
    CREATE POLICY "Users manage own integrations" ON public.user_integrations FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
ALTER TABLE public.user_memory ADD COLUMN IF NOT EXISTS behavior_summary text;
