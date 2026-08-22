-- ============================================================================
-- ROLLBACK for supabase/migrations/20260821_m08_user_notes.sql
-- Module 08 — internal admin notes.
--
-- ⚠️ THIS ONE IS NOT LIKE THE OTHER ROLLBACKS. `daily_snapshots`,
-- `cohort_metrics` and `platform_owner_recovery` are all DERIVED or empty:
-- dropping them loses nothing that cannot be recomputed. `user_notes` holds
-- ORIGINAL CONTENT typed by operators, and it is the only copy.
--
-- EXPORT BEFORE DROPPING, without exception:
--
--     SELECT id, user_id, author_id, note, is_pinned, created_at, updated_at
--       FROM public.user_notes ORDER BY created_at;
--
-- Treat that export as the internal personal data it is: it names subjects and
-- describes them in an operator's own words. Do not put it anywhere the table
-- itself would not be allowed to live.
--
-- ORDER MATTERS. Deploy the code rollback FIRST, or the user detail reads a
-- table that no longer exists. It degrades rather than crashes — the notes
-- panel renders its error state — but that is a visible, misleading state, not
-- a clean rollback.
--
--   1. revert the application (the notes panel stops reading the table)
--   2. export, as above
--   3. then run this file
-- ============================================================================

DROP INDEX IF EXISTS public.idx_user_notes_user;

DROP TABLE IF EXISTS public.user_notes;

-- ============================================================================
-- VERIFICATION (read-only, after rollback)
--
--   SELECT count(*) FROM pg_class WHERE relname='user_notes';   -- 0
--   -- credential-free: the anon probe returns to PGRST205 (absent)
-- ============================================================================
