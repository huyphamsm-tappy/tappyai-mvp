-- Phase 4: view_count + milestone notifications
-- Run in Supabase SQL Editor

-- 1. Add view_count to reviews (atomic increment via SQL function)
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS reviews_view_count_idx ON public.reviews (view_count);

-- 2. Atomic increment function (avoids client-side race condition)
CREATE OR REPLACE FUNCTION public.increment_review_view(p_review_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE public.reviews SET view_count = view_count + 1 WHERE id = p_review_id;
$$;

-- 3. Milestone tracking table — UNIQUE constraint enables ON CONFLICT DO NOTHING
CREATE TABLE IF NOT EXISTS public.review_milestones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  milestone  INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (review_id, milestone)
);

ALTER TABLE public.review_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read milestones"
  ON public.review_milestones FOR SELECT USING (true);

CREATE POLICY "Service role can insert milestones"
  ON public.review_milestones FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS review_milestones_review_idx
  ON public.review_milestones (review_id);
