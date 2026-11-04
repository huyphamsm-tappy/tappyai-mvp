-- Rollback of 20261105_chat_messages_client_id.sql. No message row is deleted or changed.
-- Before running it: deploy a web build that no longer sends `clientId` (until then a send with a clientId would fail on the missing column).
DROP INDEX IF EXISTS public.chat_messages_client_id_uniq;
ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS client_id;
