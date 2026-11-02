-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- DRAFT v3 — NOT A MIGRATION. NOT APPLIED ANYWHERE. Lives OUTSIDE supabase/migrations/ ON PURPOSE until the owner approves the design.
-- Design: docs/phase8/MESSENGER-NOTIFICATION-COLLAPSE-PROPOSAL.md §7g and docs/phase8/MESSENGER-COLLAPSE-MIGRATION-REVIEW-PACKAGE.md §8.
-- Tested (draft file loaded verbatim) by supabase/tests/notification_collapse_draft.test.ts on a production-SHAPED fixture (roles, auth.uid(), exact
-- notifications columns, nullable sender, simplified block policy). NOT tested: PostgREST, the real RLS of chat_*, the real safety_private.blocked_ids,
-- Supabase's role defaults, anything in production. Number/name are placeholders. Independent of 20261018 (no shared objects).
-- Requires: public.notifications (20260725), public.chat_messages / chat_reads / chat_is_participant (20260905).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- At most ONE unread message notification per (recipient, thread): the backstop under the advisory lock.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_message_uidx
  ON public.notifications (user_id, (data->>'threadId'))
  WHERE type = 'message' AND read_at IS NULL;

-- ── emit: service_role only. One transaction = lock + read + insert/update. No KV, no clock from the client except the optional p_now (service_role only; tests). ──
CREATE OR REPLACE FUNCTION public.emit_message_notification(
  p_user         uuid,
  p_thread       uuid,
  p_message_at   timestamptz,           -- created_at of the triggering message (database clock, read back from the INSERT)
  p_actor        uuid,                  -- sender of the triggering message; NULL when the sender account no longer exists
  p_title        text,                  -- display name of that sender (the app supplies the 'TappyAI' fallback)
  p_body         text,                  -- the FIXED generic sentence; the app never passes message text (existing route tests)
  p_entity_url   text,
  p_image_url    text,
  p_push_window  interval    DEFAULT interval '10 minutes',
  p_now          timestamptz DEFAULT NULL)
RETURNS TABLE (notification_id uuid, unread_count int, should_push boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
SET statement_timeout = '3s'
AS $$
DECLARE
  v_now       timestamptz := COALESCE(p_now, now());
  v_cursor    timestamptz;
  v_count     int;
  v_first     timestamptz;
  v_id        uuid;
  v_last_push timestamptz;
  v_last_msg  timestamptz;
  v_newest    boolean;
  v_push      boolean := false;
BEGIN
  -- D2: total order per (recipient, thread) for emit, mark_thread_read and mark_notifications_read.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_thread::text, 0));

  SELECT last_read_at INTO v_cursor FROM public.chat_reads WHERE user_id = p_user AND thread_id = p_thread;

  -- SELF-HEAL: a cursor moved by something other than the read functions (chat_reads RLS lets a client write its own cursor) must not leave a stale unread row.
  UPDATE public.notifications SET read_at = v_now
   WHERE user_id = p_user AND type = 'message' AND read_at IS NULL AND data->>'threadId' = p_thread::text
     AND v_cursor IS NOT NULL AND (data->>'lastMessageAt')::timestamptz <= v_cursor;

  IF v_cursor IS NOT NULL AND p_message_at <= v_cursor THEN RETURN; END IF;       -- covered by the cursor: nothing to point at

  -- D5: DERIVED count; nullable sender_id (deleted account) is counted (IS DISTINCT FROM, not <>).
  SELECT count(*), min(created_at) INTO v_count, v_first FROM public.chat_messages
   WHERE thread_id = p_thread AND sender_id IS DISTINCT FROM p_user AND created_at > COALESCE(v_cursor, '-infinity');
  IF v_count = 0 THEN RETURN; END IF;                                            -- nothing unread from anyone else (e.g. a retry after the messages were removed)

  SELECT n.id, (n.data->>'lastPushAt')::timestamptz, (n.data->>'lastMessageAt')::timestamptz
    INTO v_id, v_last_push, v_last_msg
    FROM public.notifications n
   WHERE n.user_id = p_user AND n.type = 'message' AND n.data->>'threadId' = p_thread::text AND n.read_at IS NULL;

  IF v_id IS NOT NULL THEN
    -- D8/D9: attribution, title, image and created_at follow the NEWEST message only; an out-of-order or retried older emit never regresses them.
    v_newest := v_last_msg IS NULL OR p_message_at >= v_last_msg;
    v_push   := v_newest AND (v_last_push IS NULL OR v_now - v_last_push >= p_push_window);   -- D3: throttle state lives in Postgres only
    UPDATE public.notifications SET
           created_at = CASE WHEN v_newest THEN p_message_at ELSE created_at END,
           actor_id   = CASE WHEN v_newest THEN p_actor      ELSE actor_id   END,
           title      = CASE WHEN v_newest THEN p_title      ELSE title      END,
           image_url  = CASE WHEN v_newest THEN p_image_url  ELSE image_url  END,
           data = data || jsonb_build_object('count', v_count)
                       || CASE WHEN v_newest THEN jsonb_build_object('lastMessageAt', p_message_at) ELSE '{}'::jsonb END
                       || CASE WHEN v_push   THEN jsonb_build_object('lastPushAt', v_now)           ELSE '{}'::jsonb END
     WHERE id = v_id AND read_at IS NULL;
    IF NOT FOUND THEN v_id := NULL; END IF;     -- the recipient marked it read with a direct client UPDATE between our SELECT and UPDATE: open a new row
  END IF;

  IF v_id IS NULL THEN
    v_push := true;
    INSERT INTO public.notifications (user_id, type, category, title, body, actor_id, entity_url, image_url, data, created_at)
    VALUES (p_user, 'message', 'social', p_title, p_body, p_actor, p_entity_url, p_image_url,
            jsonb_build_object('threadId', p_thread::text, 'kind', 'message', 'count', v_count,
                               'firstMessageAt', v_first, 'lastMessageAt', p_message_at, 'lastPushAt', v_now),
            p_message_at)
    RETURNING id INTO v_id;
  END IF;

  RETURN QUERY SELECT v_id, v_count, v_push;
END $$;

REVOKE ALL ON FUNCTION public.emit_message_notification(uuid, uuid, timestamptz, uuid, text, text, text, text, interval, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_message_notification(uuid, uuid, timestamptz, uuid, text, text, text, text, interval, timestamptz) TO service_role;

-- ── D10: the read route calls this instead of upserting chat_reads from the lambda clock. Database clock, GREATEST (cursor never regresses). ──
CREATE OR REPLACE FUNCTION public.mark_thread_read(p_thread uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
SET statement_timeout = '3s'
AS $$
DECLARE v_user uuid := auth.uid(); v_now timestamptz := now(); v_n int;
BEGIN
  IF v_user IS NULL OR NOT public.chat_is_participant(p_thread) THEN
    RAISE EXCEPTION 'not a participant' USING ERRCODE = '42501';                 -- the route already maps 42501 to 404 (no existence oracle)
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_thread::text, 0));
  INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES (p_thread, v_user, v_now)
    ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = GREATEST(public.chat_reads.last_read_at, EXCLUDED.last_read_at);
  UPDATE public.notifications SET read_at = v_now                                -- D1: only rows whose newest message the cursor has passed
   WHERE user_id = v_user AND type = 'message' AND read_at IS NULL AND data->>'threadId' = p_thread::text
     AND (data->>'lastMessageAt')::timestamptz <= v_now;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.mark_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(uuid) TO authenticated;

-- ── D7: Inbox "mark read" (all, or the given ids). A message-notification row is the thread's unread pointer, so reading it reads the thread:
--    the chat cursor moves in the same transaction under the same lock, and the next message opens a row with count 1 (nothing "resurrects"). ──
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
SET statement_timeout = '3s'
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_now    timestamptz := now();
  v_thread uuid;
  v_n      int := 0;
  v_k      int;
  c_uuid   constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;

  -- every other type, and a message row whose data was edited so that threadId is not a uuid (a recipient may UPDATE their own rows): plain read
  UPDATE public.notifications SET read_at = v_now
   WHERE user_id = v_user AND read_at IS NULL AND (p_ids IS NULL OR id = ANY (p_ids))
     AND (type <> 'message' OR COALESCE(data->>'threadId', '') !~ c_uuid);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- message rows: threads in a fixed (sorted) order so two concurrent calls, and emit, can never deadlock on each other's locks
  FOR v_thread IN
    SELECT DISTINCT (data->>'threadId')::uuid AS t FROM public.notifications
     WHERE user_id = v_user AND type = 'message' AND read_at IS NULL AND (p_ids IS NULL OR id = ANY (p_ids))
       AND COALESCE(data->>'threadId', '') ~ c_uuid
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_thread::text, 0));
    INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES (v_thread, v_user, v_now)
      ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = GREATEST(public.chat_reads.last_read_at, EXCLUDED.last_read_at);
    UPDATE public.notifications SET read_at = v_now
     WHERE user_id = v_user AND type = 'message' AND read_at IS NULL AND data->>'threadId' = v_thread::text
       AND (data->>'lastMessageAt')::timestamptz <= v_now;
    GET DIAGNOSTICS v_k = ROW_COUNT;
    v_n := v_n + v_k;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;
