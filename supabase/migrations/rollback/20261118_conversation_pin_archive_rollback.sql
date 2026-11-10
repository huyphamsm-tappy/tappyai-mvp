-- Rollback of 20261118_conversation_pin_archive.sql. Drops only the two flag columns; every conversation and message is kept. Pins and archive marks are lost (archived conversations
-- reappear in the main list), which is the intended effect of switching the feature off.

ALTER TABLE public.conversations DROP COLUMN IF EXISTS is_pinned;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS is_archived;
