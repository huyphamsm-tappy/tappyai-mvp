-- Rollback of 20261110_chat_media_retention.sql. No message and no stored picture is deleted or changed.
-- media_expired_at is KEPT: it records which pictures the retention job already removed from storage (dropping it would make a later re-run try again; harmless, but the record is useful).
-- Before running it: stop the retention cron (remove its line from vercel.json) so nothing writes the column while the function is gone.
DROP FUNCTION IF EXISTS public.chat_media_orphans(integer, integer);
DROP INDEX IF EXISTS public.chat_messages_media_due_idx;
