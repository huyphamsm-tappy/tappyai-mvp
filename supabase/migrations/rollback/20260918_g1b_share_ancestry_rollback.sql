-- Rollback for 20260918_g1b_share_ancestry.sql. Drops only what it added.
-- Non-destructive for share pages: rows survive, only the ancestry columns go.
DROP INDEX IF EXISTS public.shared_results_listed_idx;
DROP INDEX IF EXISTS public.shared_results_parent_idx;
ALTER TABLE public.shared_results
  DROP COLUMN IF EXISTS owner_is_anonymous,
  DROP COLUMN IF EXISTS parent_id;
