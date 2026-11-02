-- Rollback of 20261018_chat_honours_user_blocks.sql: restores the bodies of 20260906 / 20260905 verbatim.

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
  ) THEN
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
  );
$fn$;

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

-- The rollback restores the previous bodies, not the grants: the same EXECUTE model as the forward migration (ADR-019), stated here so a
-- restored SECURITY DEFINER function is never callable by anon or PUBLIC, whatever the state it is restored over.
REVOKE EXECUTE ON FUNCTION public.chat_can_reach(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_can_reach(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.chat_thread_blocked(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_thread_blocked(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.chat_create_group(TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_create_group(TEXT, UUID[]) TO authenticated;
