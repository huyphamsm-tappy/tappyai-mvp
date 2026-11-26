-- Rollback of 20261210_message_requests.sql.
-- A pending request's thread then reads as an ordinary conversation between the two people (the columns are dropped).
DROP TRIGGER IF EXISTS chat_messages_request_gate ON public.chat_messages;
DROP TRIGGER IF EXISTS chat_messages_request_accept ON public.chat_messages;
DROP FUNCTION IF EXISTS public.chat_request_gate();
DROP FUNCTION IF EXISTS public.chat_request_accept();
DROP FUNCTION IF EXISTS public.chat_decline_request(UUID);
DROP FUNCTION IF EXISTS public.chat_request_summaries();

-- Restore chat_thread_summaries (same signature, no request filter).
CREATE OR REPLACE FUNCTION public.chat_thread_summaries()
RETURNS TABLE(thread_id uuid, kind text, title text, last_message_at timestamptz, last_body text, last_sender_id uuid, last_created_at timestamptz, unread_count integer)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT t.id, t.kind, t.title, t.last_message_at, m.body, m.sender_id, m.created_at,
    (SELECT count(*)::int FROM public.chat_messages um
      WHERE um.thread_id = t.id AND um.sender_id IS DISTINCT FROM auth.uid()
        AND um.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz))
  FROM public.chat_threads t
  LEFT JOIN LATERAL (SELECT body, sender_id, created_at FROM public.chat_messages WHERE thread_id = t.id ORDER BY created_at DESC, id DESC LIMIT 1) m ON TRUE
  LEFT JOIN public.chat_reads r ON r.thread_id = t.id AND r.user_id = auth.uid()
  ORDER BY t.last_message_at DESC
  LIMIT 100;
$fn$;
REVOKE ALL ON FUNCTION public.chat_thread_summaries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_thread_summaries() TO authenticated, service_role;

-- Restore chat_start_direct (strangers refused with invalid_target).
CREATE OR REPLACE FUNCTION public.chat_start_direct(p_target UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_me     UUID := auth.uid();
  v_key    TEXT;
  v_thread UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501'; END IF;
  IF p_target IS NULL OR p_target = v_me THEN RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target) THEN RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023'; END IF;
  IF NOT public.chat_can_reach(p_target) THEN RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023'; END IF;
  v_key := LEAST(v_me::text, p_target::text) || ':' || GREATEST(v_me::text, p_target::text);
  INSERT INTO public.chat_threads (kind, direct_key, created_by) VALUES ('direct', v_key, v_me)
  ON CONFLICT (direct_key) WHERE kind = 'direct' DO NOTHING RETURNING id INTO v_thread;
  IF v_thread IS NULL THEN
    SELECT id INTO v_thread FROM public.chat_threads WHERE direct_key = v_key AND kind = 'direct';
    RETURN v_thread;
  END IF;
  INSERT INTO public.chat_participants (thread_id, user_id) VALUES (v_thread, v_me), (v_thread, p_target) ON CONFLICT DO NOTHING;
  RETURN v_thread;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_start_direct(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_start_direct(UUID) TO authenticated, service_role;

DROP INDEX IF EXISTS public.chat_threads_request_started_idx;
DROP INDEX IF EXISTS public.chat_threads_request_open_idx;
ALTER TABLE public.chat_threads DROP CONSTRAINT IF EXISTS chat_threads_request_state_check;
ALTER TABLE public.chat_threads
  DROP COLUMN IF EXISTS request_state,
  DROP COLUMN IF EXISTS request_sender,
  DROP COLUMN IF EXISTS request_started_at;
