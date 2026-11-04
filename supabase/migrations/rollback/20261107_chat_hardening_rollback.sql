-- Rollback of 20261107_chat_hardening.sql. No message or cursor row is touched.
DROP TRIGGER IF EXISTS chat_messages_send_limit ON public.chat_messages;
DROP FUNCTION IF EXISTS public.chat_messages_send_limit();
DROP INDEX IF EXISTS public.chat_messages_sender_created_idx;
-- the policy as 20260905 created it (no participant check on UPDATE)
DROP POLICY IF EXISTS "chat_reads_update_own" ON public.chat_reads;
CREATE POLICY "chat_reads_update_own" ON public.chat_reads
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
