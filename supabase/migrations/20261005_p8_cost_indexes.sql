-- PHASE 8 / Task 02 — cost quick win: indexes for hot filters that today scan (docs/phase8/COST_AUDIT.md).
-- Indexes only: no row, grant, policy or result changes. Rollback: rollback/20261005_p8_cost_indexes_rollback.sql
--
-- ⚠ PROD: on large tables run each statement by hand as CREATE INDEX CONCURRENTLY (outside a transaction)
--   so writes are not blocked while it builds; this file uses plain CREATE INDEX so it applies in one go.

-- /api/reviews?place_id=… ORDER BY created_at DESC (no place_id index exists at all).
CREATE INDEX IF NOT EXISTS reviews_place_created_idx ON public.reviews USING btree (place_id, created_at DESC);

-- Profile / following feeds: user_id = … ORDER BY created_at DESC (only a single-column user_id index exists).
CREATE INDEX IF NOT EXISTS reviews_user_created_idx ON public.reviews USING btree (user_id, created_at DESC);

-- Chat history lists: user_id = … ORDER BY updated_at DESC (only separate single-column indexes exist).
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON public.conversations USING btree (user_id, updated_at DESC);

-- Messenger media (Task 06 column): every attachment byte request looks the message up by attachment_id.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'attachment_id') THEN
    CREATE INDEX IF NOT EXISTS chat_messages_attachment_idx ON public.chat_messages USING btree (attachment_id)
      WHERE attachment_id IS NOT NULL;
  END IF;
END $$;
