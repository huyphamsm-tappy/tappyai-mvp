-- ============================================================================
-- PUBLICATION BOUNDARY — Phase 0 (F-2 containment)
-- ============================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- The content safety gate was enforced only in application code: every read
-- path had to remember `.or(publishableFilter())`. Measured on production
-- 2026-08-18, an ANONYMOUS PostgREST client using the public anon key read a
-- row whose `publication_state = 'UNDER_REVIEW'` — id, body, media_url,
-- thumbnail and all four lifecycle columns — without going through any route.
-- A boundary that a caller can step around by not using the front door is a
-- convention, not a boundary.
--
-- This makes it a database boundary. After this migration a held row is
-- invisible to `anon` and to any `authenticated` user who does not own it, on
-- every query, through every route, by any id.
--
-- WHY `RESTRICTIVE`, AND WHY THAT MATTERS HERE
-- --------------------------------------------
-- 🔑 The base SELECT policy on `public.reviews` — "Read visible reviews",
-- `USING (NOT is_hidden)` — was applied out-of-band and exists ONLY in
-- production. There is no `CREATE TABLE public.reviews` anywhere in this repo
-- (see docs/ios/05_DATABASE_CONTRACT.md:13,53). Rewriting a policy whose exact
-- text cannot be read is how a feed gets taken down.
--
-- A RESTRICTIVE policy is ANDed with the OR of every PERMISSIVE policy, so this
-- one narrows whatever is already there WITHOUT naming it, reading it, dropping
-- it or depending on it. The existing policies keep deciding what they decided;
-- this adds one condition that all of them must now also satisfy.
--
--     effective SELECT = (existing permissive policies OR'd) AND (this policy)
--
-- WHY THE OWNER EXCEPTION IS NOT OPTIONAL
-- ---------------------------------------
-- 🚨 Without `user_id = auth.uid()` this migration BREAKS POSTING. PostgreSQL
-- applies SELECT policies to the new row of an `INSERT … RETURNING`, and
-- `POST /api/reviews` inserts as the authenticated user and reads the id back
-- (`.insert(reviewData).select('id')`). A newly created row is written
-- `UNDER_REVIEW` by the gate, so without the owner branch the RETURNING clause
-- would see nothing and every upload would fail. The same applies to the
-- owner's `UPDATE` of `is_hidden`, which re-checks SELECT on the new row
-- (the reason 20260703_add_reviews_update_policy.sql exists at all).
--
-- The owner branch is containment-neutral: it exposes a held row to exactly one
-- person, the one who created it.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- -------------------------------
--   · it does not change any policy result, gate decision or publication state
--   · it does not publish, restrict, reclassify or delete one row
--   · it does not touch `content_reports` or `music_tracks`
--   · it does not create an exit path from UNDER_REVIEW — that is Phase 1
--   · it does not change what an author sees on their profile — that is Phase 2
--
-- `service_role` is deliberately not named: it holds BYPASSRLS, so every
-- existing server-side operation is untouched by construction.
--
-- Legacy rows keep `publication_state IS NULL` and stay publishable, which is
-- the same treatment `publishableFilter()` already gives them at the
-- application layer. Nobody's visibility changes except a held row's.
--
-- ROLLBACK (deletes nothing, restores the prior behaviour exactly):
--   DROP POLICY IF EXISTS reviews_publication_boundary ON public.reviews;
-- ============================================================================

-- Idempotent: re-runnable, and safe against a database where it already exists.
DROP POLICY IF EXISTS reviews_publication_boundary ON public.reviews;

CREATE POLICY reviews_publication_boundary
  ON public.reviews
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (
    publication_state IS NULL
    OR publication_state = 'PUBLISHED'
    OR user_id = auth.uid()
  );

COMMENT ON POLICY reviews_publication_boundary ON public.reviews IS
  'Publication boundary. RESTRICTIVE, so it narrows the existing permissive SELECT policies without replacing them. Held content (UNDER_REVIEW / RESTRICTED) is readable only by its author.';
