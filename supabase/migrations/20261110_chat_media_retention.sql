-- Messenger pictures: the server keeps a picture for a limited time, like Zalo (owner 04/11/2026: "coi Zalo làm thế nào chúng ta làm vậy"; the device keeps its own copy).
--
-- What changes (all additive):
--  1. chat_messages.media_expired_at: set by the retention job when the picture's object has been removed from the private bucket. The message stays in the history
--     (text, time, size); the page shows "photo expired" unless this browser or device still holds its own copy.
--  2. An index so the job finds the pictures that are due without scanning the table.
--  3. chat_media_orphans(older_than_hours, limit): the objects of the private bucket that NO message refers to (a picture uploaded and never sent) and that are older than
--     the given age. Service role only. It only LISTS: the removal is done through the storage API (deleting rows of storage.objects directly would leave the files).
-- The retention period itself (30 days) lives in code (src/lib/messaging/mediaRetention.ts), not here, so it can change without a migration.
-- Rollback: rollback/20261110_chat_media_retention_rollback.sql.

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_expired_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS chat_messages_media_due_idx
  ON public.chat_messages (created_at)
  WHERE media_path IS NOT NULL AND media_expired_at IS NULL;

-- plpgsql, not sql: the storage schema is Supabase's and is looked up when the function RUNS, so the migration also loads in plain PostgreSQL (tests).
CREATE OR REPLACE FUNCTION public.chat_media_orphans(p_older_than_hours integer, p_limit integer)
RETURNS TABLE (name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $fn$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY EXECUTE
    'SELECT o.name::text
       FROM storage.objects o
      WHERE o.bucket_id = ''chat-media''
        AND o.created_at < now() - make_interval(hours => $1)
        AND NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.media_path = o.name)
      ORDER BY o.created_at
      LIMIT $2'
    USING GREATEST(COALESCE(p_older_than_hours, 24), 1), LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.chat_media_orphans(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_media_orphans(integer, integer) TO service_role;
