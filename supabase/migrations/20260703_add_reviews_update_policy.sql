-- Fix: reviews table has RLS enabled but no UPDATE policy, and owners cannot
-- see their own hidden reviews (which blocks UPDATE on is_hidden = true).
--
-- Problem 1: PATCH /api/reviews/[id] (hide/unhide) silently affects 0 rows
-- because the authenticated client's UPDATE is blocked by RLS.
--
-- Problem 2: PostgreSQL checks SELECT policies on the NEW row during UPDATE.
-- The existing "Read visible reviews" SELECT policy uses (NOT is_hidden), so
-- setting is_hidden = true produces a new row that fails the SELECT check.
-- Adding an owner-visibility SELECT policy fixes this: permissive policies are
-- OR'd, so (NOT is_hidden) OR (auth.uid() = user_id) lets owners always see
-- their own reviews regardless of hidden state.
--
-- The route only updates is_hidden (hardcoded in route.ts, not user-controlled),
-- but the policy must cover the full row because PostgreSQL RLS policies cannot
-- be scoped to individual columns. The .eq('user_id', user.id) in the route
-- provides the application-level ownership check.

-- 1. UPDATE policy — lets owners update their own reviews.
--    No WITH CHECK clause: the SELECT policies (OR'd) handle new-row visibility.
CREATE POLICY "Users can update own reviews"
  ON public.reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. Owner-visibility SELECT policy — ensures owners can always read their own
--    reviews, even when is_hidden = true. Without this, setting is_hidden = true
--    via UPDATE fails because the new row doesn't pass the existing
--    "Read visible reviews" (NOT is_hidden) SELECT policy.
CREATE POLICY "Owners can see own reviews"
  ON public.reviews FOR SELECT
  USING (auth.uid() = user_id);
