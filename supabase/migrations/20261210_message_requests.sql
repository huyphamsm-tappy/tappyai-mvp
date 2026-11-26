-- ============================================================================
-- Message requests - "Tin nhan cho" (owner 26/11/2026)
--
-- WHY. Until now a stranger could not message anyone: `chat_can_reach` demanded a MUTUAL follow, and `chat_start_direct` refused the rest with
-- `invalid_target`. The owner's product decision: people who do not follow each other CAN write, but the conversation lands in the recipient's
-- WAITING messages; the sender may send at most 3 messages, text only, until the recipient replies; the recipient may reply (it becomes an ordinary
-- conversation), ignore it, or delete it, and the sender is never told they were ignored. A sender may start at most 10 new requests in 24 hours.
-- Blocks still stop everything (requests included), exactly as before.
--
-- WHAT CHANGES (all in the database, where every client - web, Android, iOS - is covered):
--   chat_threads            + request_state ('pending' | 'declined' | NULL), request_sender, request_started_at   (NULL = an ordinary conversation)
--   chat_start_direct       a pair that is not mutually reachable now opens a PENDING request (daily ceiling 10) instead of raising invalid_target.
--                           Blocked pairs and unknown accounts still raise the SAME invalid_target (no enumeration oracle).
--   chat_messages triggers  BEFORE INSERT: while a request is pending the SENDER (only) may send text only and at most 3 messages; once the recipient
--                           has declined, the sender may send no more. AFTER INSERT: the recipient's reply makes it an ordinary conversation.
--   chat_decline_request    the recipient ignores/deletes a request. The sender sees nothing change.
--   chat_thread_summaries   unchanged signature; an INCOMING request is not listed here (an old client never shows strangers in the main inbox
--                           and the main unread badge never counts them). The SENDER still sees their own pending thread.
--   chat_request_summaries  NEW: the requests that involve me, both directions, with the messages the sender has left. Incoming ones older than
--                           30 days without a reply disappear from the recipient's list.
-- Nothing is deleted. Additive columns + replaced functions with unchanged signatures (chat_start_direct, chat_thread_summaries).
-- ROLLBACK: rollback/20261210_message_requests_rollback.sql (drops the triggers, the two new functions and the three columns, and restores the two
-- replaced functions; a pending request's thread then reads as an ordinary conversation).
-- Grants follow ADR-019 (anon/authenticated named explicitly).
-- ============================================================================

ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS request_state      TEXT        NULL,
  ADD COLUMN IF NOT EXISTS request_sender     UUID        NULL,
  ADD COLUMN IF NOT EXISTS request_started_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_request_state_check') THEN
    ALTER TABLE public.chat_threads
      ADD CONSTRAINT chat_threads_request_state_check
      CHECK (request_state IS NULL OR (request_state IN ('pending', 'declined') AND kind = 'direct'));
  END IF;
END $$;

-- The daily ceiling counts what one person started in the last 24 hours; the recipient's list reads the open requests.
CREATE INDEX IF NOT EXISTS chat_threads_request_started_idx ON public.chat_threads (created_by, request_started_at) WHERE request_started_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_threads_request_open_idx    ON public.chat_threads (request_started_at) WHERE request_state IS NOT NULL;

-- ── chat_start_direct: a request instead of a refusal ───────────────────────
CREATE OR REPLACE FUNCTION public.chat_start_direct(p_target UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_me      UUID := auth.uid();
  v_key     TEXT;
  v_thread  UUID;
  v_request BOOLEAN := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_target IS NULL OR p_target = v_me THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target) THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  -- A block stops EVERY contact, a request included, and says the same thing as "no such account" (no enumeration oracle).
  IF EXISTS (
    SELECT 1 FROM public.chat_blocks
     WHERE (blocker_id = v_me AND blocked_id = p_target)
        OR (blocker_id = p_target AND blocked_id = v_me)
  ) OR p_target = ANY (safety_private.blocked_ids()) THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  v_key := LEAST(v_me::text, p_target::text) || ':' || GREATEST(v_me::text, p_target::text);

  -- An existing conversation (a pending request included) always wins: opening it again is not a new request.
  SELECT id INTO v_thread FROM public.chat_threads WHERE direct_key = v_key AND kind = 'direct';
  IF v_thread IS NOT NULL THEN
    RETURN v_thread;
  END IF;

  IF NOT public.chat_can_reach(p_target) THEN
    -- Not mutually reachable: this becomes a REQUEST, within the daily ceiling of 10 new ones per sender.
    IF (SELECT count(*) FROM public.chat_threads
         WHERE created_by = v_me AND request_started_at > now() - interval '24 hours') >= 10 THEN
      RAISE EXCEPTION 'request_daily_limit' USING ERRCODE = '53400';
    END IF;
    v_request := true;
  END IF;

  INSERT INTO public.chat_threads (kind, direct_key, created_by, request_state, request_sender, request_started_at)
       VALUES ('direct', v_key, v_me,
               CASE WHEN v_request THEN 'pending' END,
               CASE WHEN v_request THEN v_me END,
               CASE WHEN v_request THEN now() END)
  ON CONFLICT (direct_key) WHERE kind = 'direct' DO NOTHING
    RETURNING id INTO v_thread;

  IF v_thread IS NULL THEN
    SELECT id INTO v_thread FROM public.chat_threads
     WHERE direct_key = v_key AND kind = 'direct';
    RETURN v_thread;
  END IF;

  INSERT INTO public.chat_participants (thread_id, user_id)
       VALUES (v_thread, v_me), (v_thread, p_target)
  ON CONFLICT DO NOTHING;

  RETURN v_thread;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_start_direct(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_start_direct(UUID) TO authenticated, service_role;

-- ── the 3-message, text-only rule (the SENDER of a pending request only) ───
CREATE OR REPLACE FUNCTION public.chat_request_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_state  TEXT;
  v_sender UUID;
BEGIN
  SELECT request_state, request_sender INTO v_state, v_sender FROM public.chat_threads WHERE id = NEW.thread_id;
  IF v_state IS NOT NULL AND NEW.sender_id IS NOT NULL AND NEW.sender_id = v_sender THEN
    IF v_state = 'declined' THEN
      RAISE EXCEPTION 'request_limit' USING ERRCODE = '22023';
    END IF;
    IF NEW.media_path IS NOT NULL THEN
      RAISE EXCEPTION 'request_text_only' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM public.chat_messages WHERE thread_id = NEW.thread_id AND sender_id = v_sender) >= 3 THEN
      RAISE EXCEPTION 'request_limit' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_request_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_request_gate ON public.chat_messages;
CREATE TRIGGER chat_messages_request_gate BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_request_gate();

-- ── the recipient's reply turns the request into an ordinary conversation ──
CREATE OR REPLACE FUNCTION public.chat_request_accept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  UPDATE public.chat_threads
     SET request_state = NULL
   WHERE id = NEW.thread_id
     AND request_state IS NOT NULL
     AND NEW.sender_id IS NOT NULL
     AND NEW.sender_id IS DISTINCT FROM request_sender;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_request_accept() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_request_accept ON public.chat_messages;
CREATE TRIGGER chat_messages_request_accept AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_request_accept();

-- ── ignore / delete a request (the recipient only; the sender is told nothing) ─
CREATE OR REPLACE FUNCTION public.chat_decline_request(p_thread UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_me UUID := auth.uid();
  v_n  INTEGER;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.chat_threads t
     SET request_state = 'declined'
   WHERE t.id = p_thread
     AND t.request_state = 'pending'
     AND t.request_sender IS DISTINCT FROM v_me
     AND EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.thread_id = t.id AND p.user_id = v_me);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_decline_request(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_decline_request(UUID) TO authenticated, service_role;

-- ── chat_thread_summaries: same signature; an INCOMING request is not in the main list ─
CREATE OR REPLACE FUNCTION public.chat_thread_summaries()
RETURNS TABLE(thread_id uuid, kind text, title text, last_message_at timestamptz, last_body text, last_sender_id uuid, last_created_at timestamptz, unread_count integer)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    t.id,
    t.kind,
    t.title,
    t.last_message_at,
    m.body,
    m.sender_id,
    m.created_at,
    (
      SELECT count(*)::int
        FROM public.chat_messages um
       WHERE um.thread_id = t.id
         AND um.sender_id IS DISTINCT FROM auth.uid()
         AND um.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
    )
  FROM public.chat_threads t
  LEFT JOIN LATERAL (
    SELECT body, sender_id, created_at
      FROM public.chat_messages
     WHERE thread_id = t.id
     ORDER BY created_at DESC, id DESC
     LIMIT 1
  ) m ON TRUE
  LEFT JOIN public.chat_reads r
    ON r.thread_id = t.id AND r.user_id = auth.uid()
  -- an ordinary conversation, or a request I SENT (an incoming request is listed by chat_request_summaries only)
  WHERE t.request_state IS NULL OR t.request_sender = auth.uid()
  ORDER BY t.last_message_at DESC
  LIMIT 100;
$fn$;
REVOKE ALL ON FUNCTION public.chat_thread_summaries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_thread_summaries() TO authenticated, service_role;

-- ── chat_request_summaries: the requests that involve me ───────────────────
-- direction 'incoming' = somebody asked to write to me (still pending, newer than 30 days); 'outgoing' = I asked. For the sender a declined
-- request reads exactly like a pending one (never told they were ignored). `remaining` = messages the sender may still send (3 minus sent).
CREATE OR REPLACE FUNCTION public.chat_request_summaries()
RETURNS TABLE(thread_id uuid, direction text, other_user_id uuid, started_at timestamptz, last_body text, last_created_at timestamptz, unread_count integer, remaining integer)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    t.id,
    CASE WHEN t.request_sender = auth.uid() THEN 'outgoing' ELSE 'incoming' END,
    (SELECT p.user_id FROM public.chat_participants p WHERE p.thread_id = t.id AND p.user_id <> auth.uid() LIMIT 1),
    t.request_started_at,
    m.body,
    m.created_at,
    (
      SELECT count(*)::int
        FROM public.chat_messages um
       WHERE um.thread_id = t.id
         AND um.sender_id IS DISTINCT FROM auth.uid()
         AND um.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
    ),
    GREATEST(0, 3 - (SELECT count(*)::int FROM public.chat_messages sm WHERE sm.thread_id = t.id AND sm.sender_id = t.request_sender))
  FROM public.chat_threads t
  LEFT JOIN LATERAL (
    SELECT body, created_at
      FROM public.chat_messages
     WHERE thread_id = t.id
     ORDER BY created_at DESC, id DESC
     LIMIT 1
  ) m ON TRUE
  LEFT JOIN public.chat_reads r
    ON r.thread_id = t.id AND r.user_id = auth.uid()
  WHERE t.request_state IS NOT NULL
    AND (
      t.request_sender = auth.uid()
      OR (t.request_state = 'pending' AND t.request_started_at > now() - interval '30 days')
    )
  ORDER BY t.last_message_at DESC
  LIMIT 100;
$fn$;
REVOKE ALL ON FUNCTION public.chat_request_summaries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_request_summaries() TO authenticated, service_role;

-- Check afterwards (expect: 3 columns, 2 triggers, 2 new functions):
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'chat_threads' AND column_name LIKE 'request_%';
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('chat_messages_request_gate', 'chat_messages_request_accept');
--   SELECT proname FROM pg_proc WHERE proname IN ('chat_decline_request', 'chat_request_summaries');
