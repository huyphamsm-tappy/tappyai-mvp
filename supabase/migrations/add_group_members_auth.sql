-- ============================================================================
-- Security Issue (High): group_members INSERT is fully anonymous
-- ============================================================================
-- Root cause: add_groups.sql:25 defines
--   CREATE POLICY "Anyone can join a group" ... FOR INSERT WITH CHECK (true)
-- and /api/group/[id]/join used the anon client with no auth check, so anyone
-- could inject arbitrary member rows (name/budget/dietary/area) into ANY group
-- by id. The group create + suggest routes are already authenticated; join was
-- the gap.
--
-- Fix: attribute each membership to the authenticated user and restrict INSERT
-- to that user. Backward compatible — existing rows keep user_id = NULL and are
-- unaffected; only new inserts must be authenticated and self-attributed.
-- Idempotent; never edits historical migrations.
-- ============================================================================

-- 1. Owner column (nullable for existing anonymous rows) ---------------------
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. One membership per (group, user); NULLs (legacy rows) are exempt --------
CREATE UNIQUE INDEX IF NOT EXISTS group_members_group_user_uniq
  ON public.group_members (group_id, user_id)
  WHERE user_id IS NOT NULL;

-- 3. Replace the anonymous INSERT policy with an authenticated, self-scoped one
DROP POLICY IF EXISTS "Anyone can join a group" ON public.group_members;
DROP POLICY IF EXISTS group_members_insert_self ON public.group_members;
CREATE POLICY group_members_insert_self ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Members may remove their own membership (previously impossible — no policy).
DROP POLICY IF EXISTS group_members_delete_self ON public.group_members;
CREATE POLICY group_members_delete_self ON public.group_members
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
