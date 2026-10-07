-- ============================================================================
-- Profile public presentation: `profiles.bio` and `profiles.cover_url`
-- ============================================================================
-- Explore Public Profile V2 (2026-09-15).
--
-- WHY
--   • Bio. `add_profile_edit.sql` declared `profiles.bio` but was never applied
--     to production (read-only probe 2026-09-15: `select=bio` → 42703). Since
--     then the edit form has been saving the bio into `auth.users.user_metadata`,
--     which only the owner's own session can read — so the self-description a
--     user writes for others is invisible to every visitor, and `/profile`
--     (which reads `profiles.bio`) never shows it either. One column on the
--     public profile row makes the bio one field with one reader.
--   • Cover. There is no cover column and no upload route accepts one. This is
--     the reference the existing media bridge (`putMedia`, `covers/` prefix)
--     points at; the object itself lives in the same public media bucket as
--     avatars.
--
-- SAFETY
--   `profiles` is public-read and self-write (RLS: SELECT true; UPDATE id =
--   auth.uid()). Both columns are meant to be public — the same class as
--   `full_name` and `avatar_url`, which are already on this row — so no policy
--   changes. Nothing sensitive is added.
--
-- The application code is written to run before OR after this file is applied:
-- reads fall back to the previous column set on 42703, and the cover control
-- only appears once the column exists. Apply, then the feature lights up.
--
-- Idempotent. Owner applies via Dashboard → SQL Editor.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio        text,
  ADD COLUMN IF NOT EXISTS cover_url  text;

COMMENT ON COLUMN public.profiles.bio IS
  'Public self-description, max 200 chars (enforced by PATCH /api/profile). Public like full_name.';
COMMENT ON COLUMN public.profiles.cover_url IS
  'Public profile cover image URL written only by POST /api/profile (covers/<uid>-<suffix>). NULL = no cover.';

-- Verify (read-only):
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND column_name IN ('bio', 'cover_url');
-- Expect two rows.
