-- Messenger hardening (Inbox & Messenger audit, 04/11/2026; owner: "web xong hết"). Two findings of the audit, both at the database:
--
--  1. P3 · chat_reads UPDATE had no participant check: a user could point their own read-cursor row at a thread they are not in
--     (the INSERT policy already required participation; the UPDATE policy did not). It now requires both, like the INSERT policy.
--
--  2. P2 · the send route's 60-per-minute limiter lives in the route, so a client holding the authenticated key could INSERT into chat_messages
--     directly (the table grants INSERT) and skip it. A BEFORE INSERT trigger now refuses a sender's 121st message inside one minute (SQLSTATE 53400)
--     whoever is asking. It is a BACKSTOP at twice the route's limit, not a replacement: the route stays the first line (60/min, 429) so ordinary
--     use never meets this; the route maps 53400 to the same 429. (DR-2 keeps the route limiter per-instance.)
--
-- Additive and safe before the web release: a policy is replaced by a stricter one, one partial index and one trigger are added. No data is touched.
-- Rollback: rollback/20261107_chat_hardening_rollback.sql.

-- 1 ── chat_reads: your own cursor, in a thread you are in, for INSERT and UPDATE alike.
DROP POLICY IF EXISTS "chat_reads_update_own" ON public.chat_reads;
CREATE POLICY "chat_reads_update_own" ON public.chat_reads
  FOR UPDATE USING (user_id = auth.uid() AND public.chat_is_participant(thread_id))
  WITH CHECK (user_id = auth.uid() AND public.chat_is_participant(thread_id));

-- 2 ── the backstop. The index keeps the one-minute count cheap (it is read on every insert).
CREATE INDEX IF NOT EXISTS chat_messages_sender_created_idx
  ON public.chat_messages (sender_id, created_at DESC)
  WHERE sender_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.chat_messages_send_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY DEFINER so the count sees every message of the sender, not only the threads the caller's RLS shows (the same person, but be exact).
  IF NEW.sender_id IS NOT NULL AND (
       SELECT count(*) FROM public.chat_messages
        WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute'
     ) >= 120 THEN
    RAISE EXCEPTION 'chat send rate limit' USING ERRCODE = '53400';
  END IF;
  RETURN NEW;
END $$;

-- A trigger function is never called by a client role (a trigger does not check EXECUTE at fire time), so no role is granted it. ADR-019: name every client role.
REVOKE ALL ON FUNCTION public.chat_messages_send_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_send_limit ON public.chat_messages;
CREATE TRIGGER chat_messages_send_limit
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_send_limit();
