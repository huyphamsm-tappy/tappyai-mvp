-- Rollback for 20261001_user_blocks.sql. chat_blocks was never touched, so nothing to restore there.
-- Blocks made through the new API were ALSO written to chat_blocks (the chat keeps those); only user_blocks goes.
BEGIN;
DROP POLICY IF EXISTS user_blocks_follows_insert ON public.user_follows;
DROP POLICY IF EXISTS user_blocks_comments_insert ON public.review_comments;
DROP POLICY IF EXISTS user_blocks_likes_insert ON public.review_likes;
DROP POLICY IF EXISTS user_blocks_reviews_select ON public.reviews;
DROP POLICY IF EXISTS user_blocks_comments_select ON public.review_comments;
DROP POLICY IF EXISTS user_blocks_notifications_select ON public.notifications;
DROP POLICY IF EXISTS user_blocks_comments_delete_by_review_owner ON public.review_comments;
DROP FUNCTION IF EXISTS safety_private.review_author_blocked(uuid);
DROP FUNCTION IF EXISTS safety_private.blocked_ids();
DROP SCHEMA IF EXISTS safety_private;
DROP TABLE IF EXISTS public.user_blocks;
COMMIT;
