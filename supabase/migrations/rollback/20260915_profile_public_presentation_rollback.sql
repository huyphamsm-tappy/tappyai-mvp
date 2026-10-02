-- Rollback of 20260915_profile_public_presentation.sql. Drops the two public
-- presentation columns that migration added (and the values in them: bios written
-- since, and cover URLs); the uploaded objects under covers/ are not deleted by this
-- statement. Nothing else on `profiles` is touched — no policy changes to undo, the
-- forward migration made none. The application tolerates the columns' absence
-- (42703 schema bridge in /api/profile and /api/users/[id]). Idempotent.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS bio,
  DROP COLUMN IF EXISTS cover_url;
