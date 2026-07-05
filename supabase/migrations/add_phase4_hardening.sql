-- Phase 4 Hardening — idempotent, safe to re-run
-- 1. RLS: review_interactions (idempotent recreate)
-- 2. RLS: review_milestones INSERT lock-down (W-04)
-- 3. RPC: get_interaction_avgs (W-02 performance)

-- ============================================================
-- 1. review_interactions — ensure correct user isolation policy
-- ============================================================
ALTER TABLE public.review_interactions
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own interactions"
  ON public.review_interactions;

CREATE POLICY "Users manage own interactions"
  ON public.review_interactions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2. review_milestones — remove overly permissive INSERT policy
--    Service role bypasses RLS naturally; no INSERT policy needed
--    for authenticated users (W-04 fix)
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert milestones"
  ON public.review_milestones;

-- ============================================================
-- 3. get_interaction_avgs — DB-side AVG to avoid full-row transfer
--    Called after upsert so the current row is included in AVG
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_interaction_avgs(
  p_review_id UUID
)
RETURNS TABLE(
  avg_watch    FLOAT,
  avg_completion FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    AVG(watch_seconds)::FLOAT,
    AVG(completion_rate)::FLOAT
  FROM public.review_interactions
  WHERE review_id = p_review_id;
$$;
