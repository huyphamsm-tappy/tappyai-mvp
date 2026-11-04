-- Messenger images (owner 04/11/2026: "gửi ảnh trước"; defaults approved: private Supabase bucket, JPEG/PNG/WebP <= 5 MB, EXIF stripped, signed URLs by the server).
-- DR-7 ("Messenger media: HOÃN") is lifted for IMAGES only; clips stay deferred.
--
-- What changes:
--  1. chat_messages gets media_path / media_type / media_width / media_height. A message is text, an image, or both: the body may be empty only when it
--     carries an image. (The old CHECK `length(body) BETWEEN 1 AND 4000` is replaced.)
--  2. media_path must live under the message's own thread AND its sender's own folder ("<thread>/<sender>/<file>"), so a path cannot point at somebody
--     else's object even through a direct REST insert; and one object can be attached to ONE message (unique index).
--  3. The private bucket `chat-media` (5 MB, three image types). NO storage policy is created: nothing reads or writes the bucket with a client key.
--     The server uploads with the service role after checking the session and the thread, and hands out short-lived signed URLs only for messages the caller
--     can read (row-level security on chat_messages is the access check). The bucket is created only when the storage schema exists (not in plain PostgreSQL).
--
-- Additive and safe before the web release: nullable columns, a relaxed body rule, one index, one bucket. Existing rows and older clients are unaffected.
-- What is NOT here: scanning of image content (a separate decision), cleanup of objects whose upload was never attached to a message (a later job),
-- deleting a deleted account's objects (done by the account-deletion code, see src/lib/media/accountMediaDeletion.ts).
-- Rollback: rollback/20261109_chat_media_rollback.sql.

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_path   text NULL;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_type   text NULL;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_width  integer NULL;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS media_height integer NULL;

-- The body rule: text up to 4000 characters, or an image with no text. Drop the original (and any twin of it) by what it says, not only by its name.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.chat_messages'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%length(body)%'
  LOOP
    EXECUTE format('ALTER TABLE public.chat_messages DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_body_check
  CHECK (length(body) <= 4000 AND (length(body) >= 1 OR media_path IS NOT NULL));

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_media_shape;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_media_shape CHECK (
  (media_path IS NULL AND media_type IS NULL AND media_width IS NULL AND media_height IS NULL)
  -- IS NOT DISTINCT FROM, not "=": a CHECK that evaluates to NULL PASSES, so `media_type = 'image'` with a NULL type would have let a path through untyped.
  OR (media_path IS NOT NULL AND media_type IS NOT DISTINCT FROM 'image'
      AND (media_width  IS NULL OR media_width  BETWEEN 1 AND 20000)
      AND (media_height IS NULL OR media_height BETWEEN 1 AND 20000))
);

-- "<thread>/<sender>/<file>": the thread and the sender are the row's own. A deleted sender (NULL) leaves the path as it was.
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_media_path_owner;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_media_path_owner CHECK (
  media_path IS NULL
  OR (media_path LIKE thread_id::text || '/%'
      AND (sender_id IS NULL OR media_path LIKE thread_id::text || '/' || sender_id::text || '/%'))
);

-- One object, one message.
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_media_path_uniq ON public.chat_messages (media_path) WHERE media_path IS NOT NULL;

-- The private bucket (only where the storage schema exists). On conflict it is left as it is — an existing bucket is never flipped to public by this file.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('chat-media', 'chat-media', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
