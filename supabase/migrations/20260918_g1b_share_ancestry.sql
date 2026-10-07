-- ============================================================================
-- TappyAI G1-B — share ancestry + anonymous second-generation sharing
--
-- GATE: NOT YET AUTHORIZED FOR PRODUCTION. Additive only: two nullable/defaulted
--       columns and one index on `shared_results`. Depends on
--       20260913_g1_growth_foundation.sql. IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK: supabase/migrations/rollback/20260918_g1b_share_ancestry_rollback.sql
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- The viral loop's second generation: a person who arrived on /r/<slug>, asked
-- a follow-up and got a useful answer should be able to share THAT — before
-- they have an account. Two facts make that safe and measurable:
--
--   parent_id            the share this one was made from. Lets the loop be
--                        measured as a chain (share → viewer → share) rather than
--                        as isolated events, without a referral programme.
--   owner_is_anonymous   true while the owner is a Supabase anonymous session.
--                        Such pages stay public (a recipient can open them) but
--                        are NOINDEX and UNLISTED (no sitemap, no hub listing)
--                        until the owner signs up — an anonymous session must
--                        not be able to mint indexable pages at will.
--
-- No policy changes: writes are still service-role only; the owner policies
-- from the foundation migration apply unchanged.
-- ============================================================================

ALTER TABLE public.shared_results
  ADD COLUMN IF NOT EXISTS parent_id          UUID    REFERENCES public.shared_results(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_is_anonymous BOOLEAN NOT NULL DEFAULT false;

-- Ancestry lookups (children of a share) and the "listed" filter used by the
-- sitemap/hubs (public AND not anonymous-owned).
CREATE INDEX IF NOT EXISTS shared_results_parent_idx
  ON public.shared_results (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shared_results_listed_idx
  ON public.shared_results (domain, created_at DESC) WHERE status = 'public' AND owner_is_anonymous = false;
