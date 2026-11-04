-- Rollback of 20261109_chat_media.sql. NO message and NO stored image is deleted or changed.
--  - the body rule goes back to 1..4000 as NOT VALID (enforced for new rows; image-only rows already stored keep their empty body and are not re-checked);
--  - the media constraints and the unique index are dropped; the four media columns are KEPT (they hold the references to the stored images);
--  - the bucket `chat-media` is NOT removed (a bucket with objects cannot be deleted by SQL; the images stay reachable to the service role).
-- Before running it: deploy a web build that no longer sends or shows images.
DROP INDEX IF EXISTS public.chat_messages_media_path_uniq;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_media_path_owner;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_media_shape;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_body_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_body_check CHECK (length(body) BETWEEN 1 AND 4000) NOT VALID;
