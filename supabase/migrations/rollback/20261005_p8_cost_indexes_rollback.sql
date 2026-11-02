-- Rollback of 20261005_p8_cost_indexes.sql — drops the four indexes (no data involved).
DROP INDEX IF EXISTS public.reviews_place_created_idx;
DROP INDEX IF EXISTS public.reviews_user_created_idx;
DROP INDEX IF EXISTS public.conversations_user_updated_idx;
DROP INDEX IF EXISTS public.chat_messages_attachment_idx;
