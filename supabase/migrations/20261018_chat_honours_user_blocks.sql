-- WEB-ONLY Phase 8 / Messenger: the chat honours `user_blocks` (owner decision 2026-10-10).
--
-- Until now the chat functions read only `chat_blocks`; a block made through POST /api/users/[id]/block wrote both tables, so a direct
-- conversation was already stopped, but a `user_blocks` row without a `chat_blocks` partner (a failed second write, a direct SQL row)
-- stopped nothing in the chat, and creating a GROUP checked no block at all.
--
-- Same semantics as the existing chat block (migration 20260906): symmetric, stops new contact and new messages, never erases history.
--   * chat_can_reach        - a `user_blocks` pair (either direction) is not reachable (same boolean as before; no new error).
--   * chat_thread_blocked   - a `user_blocks` pair among the other participants blocks sending (policy unchanged; same 42501 -> 404).
--   * chat_create_group     - a member in a block pair with the creator is refused with the SAME `invalid_members` an unknown account raises.
-- Signatures, grants, return types and error codes are unchanged, so Android/iOS clients need no change. Reading history, the thread list
-- and the read cursor are deliberately untouched. Rollback: rollback/20261018_chat_honours_user_blocks_rollback.sql.
-- Requires 20261001_user_blocks.sql (safety_private.blocked_ids).

CREATE OR REPLACE FUNCTION public.chat_can_reach(p_target UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_me     UUID := auth.uid();
  v_policy TEXT;
BEGIN
  IF v_me IS NULL OR p_target IS NULL OR p_target = v_me THEN
    RETURN false;
  END IF;

  -- A block stops the conversation before any policy is consulted, in BOTH
  -- directions. Someone you blocked must not be able to reach you either.
  IF EXISTS (
    SELECT 1 FROM public.chat_blocks
     WHERE (blocker_id = v_me AND blocked_id = p_target)
        OR (blocker_id = p_target AND blocked_id = v_me)
  ) OR p_target = ANY (safety_private.blocked_ids()) THEN
    RETURN false;
  END IF;

  -- An existing conversation always wins. Once two people are talking, an
  -- unfollow or a later policy change must not break the thread in progress.
  IF EXISTS (
    SELECT 1 FROM public.chat_threads
     WHERE kind = 'direct'
       AND direct_key = LEAST(v_me::text, p_target::text) || ':' || GREATEST(v_me::text, p_target::text)
  ) THEN
    RETURN true;
  END IF;

  SELECT reachability INTO v_policy FROM public.chat_settings WHERE id;
  -- No settings row is not permission to open the doors.
  v_policy := COALESCE(v_policy, 'mutual_follow');

  IF v_policy = 'anyone' THEN
    RETURN true;
  END IF;

  IF v_policy = 'recipient_follows_sender' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_follows
       WHERE follower_id = p_target AND following_id = v_me
    );
  END IF;

  -- mutual_follow (the default, and the fallback for any unknown value).
  RETURN EXISTS (SELECT 1 FROM public.user_follows WHERE follower_id = v_me     AND following_id = p_target)
     AND EXISTS (SELECT 1 FROM public.user_follows WHERE follower_id = p_target AND following_id = v_me);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.chat_can_reach(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_can_reach(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.chat_thread_blocked(p_thread UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_participants p
      JOIN public.chat_blocks b
        ON (b.blocker_id = auth.uid() AND b.blocked_id = p.user_id)
        OR (b.blocker_id = p.user_id  AND b.blocked_id = auth.uid())
     WHERE p.thread_id = p_thread
       AND p.user_id <> auth.uid()
  ) OR EXISTS (
    SELECT 1
      FROM public.chat_participants p
     WHERE p.thread_id = p_thread
       AND p.user_id <> auth.uid()
       AND p.user_id = ANY (safety_private.blocked_ids())
  );
$fn$;

REVOKE EXECUTE ON FUNCTION public.chat_thread_blocked(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_thread_blocked(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.chat_create_group(p_title TEXT, p_members UUID[])
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_thread  UUID;
  v_members UUID[];
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;

  -- Distinct, real, and never the creator twice. A group of one is a note to
  -- self, not a conversation.
  SELECT COALESCE(array_agg(DISTINCT u.id), '{}')
    INTO v_members
    FROM auth.users u
   WHERE u.id = ANY(COALESCE(p_members, '{}'::uuid[])) AND u.id <> v_me;

  IF array_length(v_members, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_members' USING ERRCODE = '22023';
  END IF;
  -- A block stops NEW contact, in both directions, exactly as it does for a direct conversation: nobody who is in a block
  -- pair with the creator (user_blocks or chat_blocks) can be put in a group with them. The refusal is the same
  -- `invalid_members` an unknown account raises, so it does not say who blocked whom.
  IF EXISTS (
    SELECT 1 FROM unnest(v_members) AS m
     WHERE m = ANY (safety_private.blocked_ids())
        OR EXISTS (SELECT 1 FROM public.chat_blocks b
                    WHERE (b.blocker_id = v_me AND b.blocked_id = m) OR (b.blocker_id = m AND b.blocked_id = v_me))
  ) THEN
    RAISE EXCEPTION 'invalid_members' USING ERRCODE = '22023';
  END IF;
  IF array_length(v_members, 1) > 49 THEN
    RAISE EXCEPTION 'too_many_members' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.chat_threads (kind, title, created_by)
       VALUES ('group', NULLIF(btrim(COALESCE(p_title, '')), ''), v_me)
    RETURNING id INTO v_thread;

  INSERT INTO public.chat_participants (thread_id, user_id)
       SELECT v_thread, m FROM unnest(v_members || v_me) AS m
  ON CONFLICT DO NOTHING;

  RETURN v_thread;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.chat_create_group(TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_create_group(TEXT, UUID[]) TO authenticated;
