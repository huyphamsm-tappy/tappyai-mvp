-- Messenger: an idempotency key for sending (Inbox & Messenger audit, 04/11/2026; P2 "a retry after a timeout stores the message twice").
--
-- The send route accepts an optional `clientId` (a uuid the client makes once per send attempt and repeats on a retry). It is stored here, and
-- the unique index below turns a repeat of the same send into a unique violation, which the route answers with the row that is already stored.
--
-- Additive and safe to apply before the web release: one nullable column and one partial unique index (rows without a client id are not indexed,
-- so every existing row and every older client is unaffected). No grant, policy, trigger or function changes. The column holds no personal data.
-- Order: APPLY BEFORE the web release that sends `client_id` (the route only writes the column when the client sends a clientId).
-- Rollback: rollback/20261105_chat_messages_client_id_rollback.sql (drops the index, then the column; no message is touched).

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS client_id UUID NULL;

-- One stored message per (thread, sender, client id). `chat_messages` is small today; if it grows large, build this index CONCURRENTLY outside a transaction.
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_id_uniq
  ON public.chat_messages (thread_id, sender_id, client_id)
  WHERE client_id IS NOT NULL;
