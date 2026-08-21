-- ============================================================================
-- ROLLBACK for supabase/migrations/20260821_m09_moderation_queue.sql
-- Module 09 Content Moderation.
--
-- ⚠️ `moderation_queue` is DERIVED and can be rebuilt by re-running the
-- ingestion — but `moderation_actions` is NOT. It is the record of decisions
-- human moderators made, and it exists nowhere else.
--
-- Two things are lost that no re-ingestion restores:
--
--   1. Every moderator decision, with its reason, actor and timestamp.
--   2. The queue's own triage state — which items were dismissed, resolved,
--      assigned or re-prioritised. Re-running the ingestion returns every
--      report to `pending`, so a rollback followed by a re-apply reopens work
--      that was already finished.
--
-- EXPORT BOTH BEFORE DROPPING:
--
--     SELECT * FROM public.moderation_actions ORDER BY created_at;
--     SELECT id, type, status, priority, target_type, target_id,
--            resolution, resolved_by, resolved_at
--       FROM public.moderation_queue WHERE status <> 'pending';
--
-- Treat the export as internal personal data: it names reporters, authors and
-- moderators, and `metadata` carries the opaque provenance ids ADR-026 keeps
-- inside the service tier.
--
-- The SOURCE tables are untouched by this rollback and by the migration:
-- `music_track_reports` and `content_reports` keep every row. ADR-026 I-4
-- holds in both directions — the migration adds nothing to `content_reports`,
-- and this removes nothing from it.
--
-- ORDER MATTERS. Deploy the code rollback FIRST, or the moderation surface
-- reads tables that no longer exist, and `analytics-snapshot` logs a failing
-- ingestion step every night.
--
--   1. revert the application (the queue surface and the cron step go)
--   2. export, as above
--   3. then run this file
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_ingest_moderation_reports();

-- Actions first: it references the queue.
DROP TABLE IF EXISTS public.moderation_actions;
DROP TABLE IF EXISTS public.moderation_queue;

-- The enums outlive their tables, so they are named explicitly. Dropping them
-- is safe only because nothing else in the schema uses them — verify first if
-- that has changed:
--   SELECT c.relname, a.attname FROM pg_attribute a
--     JOIN pg_class c ON c.oid = a.attrelid
--     JOIN pg_type t ON t.oid = a.atttypid
--    WHERE t.typname IN ('moderation_type','moderation_status','moderation_action_type');
DROP TYPE IF EXISTS moderation_action_type;
DROP TYPE IF EXISTS moderation_status;
DROP TYPE IF EXISTS moderation_type;

-- ============================================================================
-- VERIFICATION (read-only, after rollback)
--
--   SELECT count(*) FROM pg_class WHERE relname LIKE 'moderation_%';   -- 0
--   SELECT count(*) FROM pg_type  WHERE typname LIKE 'moderation%';    -- 0
--   SELECT count(*) FROM public.content_reports;      -- UNCHANGED
--   SELECT count(*) FROM public.music_track_reports;  -- UNCHANGED
--
--   -- credential-free: the anon probe returns to PGRST205 (absent)
-- ============================================================================
