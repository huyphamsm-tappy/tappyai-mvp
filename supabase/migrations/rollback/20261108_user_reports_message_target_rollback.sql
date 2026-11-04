-- Rollback of 20261108_user_reports_message_target.sql. Existing reports of messages are KEPT (they are moderation evidence): the old list comes back
-- as NOT VALID, which enforces it for new rows only and does not re-check the rows already stored.
ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_target_type_check;
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_target_type_check CHECK (target_type IN ('comment', 'user')) NOT VALID;
