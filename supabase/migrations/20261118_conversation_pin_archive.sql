-- Chat workspace (desktop), slice 2: pin and archive a conversation (owner 10/11/2026). Two additive boolean columns on public.conversations; nothing reads or writes them until the
-- chat workspace flag (NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED) is on, and existing rows read as "not pinned, not archived". The existing row-level policy ("Users can manage own
-- conversations") and the table-level grants already cover the new columns, so a person can change only their own rows. No index: the history list reads one person's rows by user_id.
-- Rollback: rollback/20261118_conversation_pin_archive_rollback.sql.

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_pinned   boolean NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
