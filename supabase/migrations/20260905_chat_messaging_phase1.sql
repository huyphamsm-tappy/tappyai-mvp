-- ============================================================================
-- Social messaging, Phase 1 — `chat_threads`, `chat_participants`,
-- `chat_messages`, `chat_reads`, and the three functions that mint membership.
--
-- GATE: NOT YET AUTHORIZED FOR PRODUCTION. No previous authorization covers
--       these tables. Applying this needs its own explicit Owner authorization,
--       preflight and rollback window (ADR-017 pattern).
--
-- Idempotent — safe to re-run.
--
-- ---------------------------------------------------------------------------
-- 🚨 THIS IS NOT `public.conversations`, AND THE TWO MUST NEVER MERGE.
--
--   public.conversations   User <-> TappyAI. AI assistant history. ONE owner
--                          (`user_id`), every turn inside a `messages` JSONB
--                          blob capped at 200 items / 512KB. It cannot express
--                          two people, a read cursor, or a per-message row, and
--                          its RLS is `user_id = auth.uid()`.
--
--   public.chat_threads    User <-> User. Real participants, real message rows,
--                          real read state.
--
-- The name collision is why these tables are prefixed `chat_` rather than
-- taking the obvious ones. `conversations` is not renamed, not altered, and not
-- read by anything here.
--
-- Also NOT reused: `public.groups` / `public.group_members`. Those are Nhóm ăn
-- (group dining) — members are free-text names with food preferences and no
-- `auth.users` reference, and their RLS is `USING (true)`. Nothing about them
-- is a chat group.
-- ---------------------------------------------------------------------------

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
  -- Group name. NULL for direct threads, which are titled from the counterpart.
  title           TEXT NULL,
  created_by      UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  /**
   * 🔑 DUPLICATE 1-1 PREVENTION IS A DATABASE CONSTRAINT, NOT APPLICATION LOGIC.
   *
   * `least(a,b) || ':' || greatest(a,b)` — order-independent, so A→B and B→A
   * produce the same key. The partial unique index below makes a second direct
   * thread between the same pair impossible, which matters precisely in the
   * case application logic gets wrong: both people tapping each other at the
   * same moment. One insert wins, the other conflicts and reads the winner's
   * row. A "check then insert" in the API cannot do that.
   *
   * NULL for groups: two groups with the same members are legitimately two
   * different groups.
   */
  direct_key      TEXT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Maintained by trigger. Orders the conversation list without an aggregate.
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A direct thread has exactly two participants and needs its key; a group has
  -- a name and must not carry one. Enforced rather than trusted.
  CONSTRAINT chat_threads_direct_has_key
    CHECK ((kind = 'direct' AND direct_key IS NOT NULL)
        OR (kind = 'group'  AND direct_key IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_direct_key_uniq
  ON public.chat_threads (direct_key) WHERE kind = 'direct';
CREATE INDEX IF NOT EXISTS chat_threads_last_message_idx
  ON public.chat_threads (last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_participants_user_idx
  ON public.chat_participants (user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: a deleted account must not silently rewrite the
  -- other participant's history into gaps.
  sender_id  UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The read path: one thread, newest first, paginated.
CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx
  ON public.chat_messages (thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_reads (
  thread_id    UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /**
   * A cursor, not a counter. Unread is derived — messages in this thread newer
   * than `last_read_at` and not sent by me — so it cannot drift out of step
   * with the messages the way a stored integer does.
   */
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity',
  PRIMARY KEY (thread_id, user_id)
);

-- ── Membership predicate ────────────────────────────────────────────────────
/**
 * 🚨 THIS FUNCTION EXISTS TO BREAK RLS RECURSION, AND THAT IS ITS WHOLE JOB.
 *
 * `chat_participants` needs a SELECT policy meaning "rows of threads I am in".
 * Written directly, that policy queries `chat_participants` — which re-enters
 * the same policy — and PostgreSQL raises `infinite recursion detected in
 * policy for relation "chat_participants"`. Every policy below therefore asks
 * this SECURITY DEFINER function instead, which reads the table with RLS
 * bypassed and answers one boolean.
 *
 * It is safe because it answers only about the CALLER: `auth.uid()` is read
 * inside, never passed in, so there is no argument a caller could vary to learn
 * about anyone else's membership.
 */
CREATE OR REPLACE FUNCTION public.chat_is_participant(p_thread UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE thread_id = p_thread AND user_id = auth.uid()
  );
$$;

-- ADR-019: born fully open, so both Supabase roles are revoked before the one
-- that actually calls this is granted back.
REVOKE EXECUTE ON FUNCTION public.chat_is_participant(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_is_participant(UUID) TO authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- 🔑 MEMBERSHIP IS NOT CLIENT-MINTABLE. `authenticated` is granted SELECT on
-- threads and participants and never INSERT — the only way a row appears in
-- `chat_participants` is through the two SECURITY DEFINER functions below, both
-- of which decide the membership themselves. Without that, an INSERT policy
-- permissive enough to let you add a second person to a new thread is also
-- permissive enough to let you add yourself to someone else's.

ALTER TABLE public.chat_threads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reads        ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- chat_threads: read the threads you are in. Nothing else, ever.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_threads' AND policyname = 'chat_threads_select_participant') THEN
    CREATE POLICY "chat_threads_select_participant" ON public.chat_threads
      FOR SELECT USING (public.chat_is_participant(id));
  END IF;

  -- chat_participants: see the roster of your own threads (needed to render who
  -- is in a group), and nobody else's.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_participants' AND policyname = 'chat_participants_select_own_threads') THEN
    CREATE POLICY "chat_participants_select_own_threads" ON public.chat_participants
      FOR SELECT USING (public.chat_is_participant(thread_id));
  END IF;

  -- chat_messages: read your threads' messages.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'chat_messages_select_participant') THEN
    CREATE POLICY "chat_messages_select_participant" ON public.chat_messages
      FOR SELECT USING (public.chat_is_participant(thread_id));
  END IF;

  /**
   * chat_messages INSERT — BOTH halves are load-bearing.
   *
   *   chat_is_participant(thread_id)  you may only write into your own threads
   *   sender_id = auth.uid()          you may only write AS YOURSELF
   *
   * Dropping the second turns every thread you belong to into a forgery
   * primitive: a participant could post a row attributed to the other person.
   */
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'chat_messages_insert_participant') THEN
    CREATE POLICY "chat_messages_insert_participant" ON public.chat_messages
      FOR INSERT WITH CHECK (public.chat_is_participant(thread_id) AND sender_id = auth.uid());
  END IF;

  -- chat_reads: your own cursor, in your own threads. No UPDATE policy is
  -- granted for anyone else's row, so a read receipt cannot be moved on your
  -- behalf.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_reads' AND policyname = 'chat_reads_select_own') THEN
    CREATE POLICY "chat_reads_select_own" ON public.chat_reads
      FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_reads' AND policyname = 'chat_reads_insert_own') THEN
    CREATE POLICY "chat_reads_insert_own" ON public.chat_reads
      FOR INSERT WITH CHECK (user_id = auth.uid() AND public.chat_is_participant(thread_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_reads' AND policyname = 'chat_reads_update_own') THEN
    CREATE POLICY "chat_reads_update_own" ON public.chat_reads
      FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- 🚨 RLS IS NOT THE WHOLE BOUNDARY. Supabase ships
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated, service_role`, so these tables are born readable and writable
-- by `anon`. Enabling RLS without revoking is the exact shape of hole ADR-019
-- was written about.
--
-- `anon` gets nothing at all here: anonymous sessions are read-only social
-- (`refuseAnonymousSocialWrite`), and private conversations are not browsable.

REVOKE ALL ON TABLE public.chat_threads      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_participants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_messages     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_reads        FROM PUBLIC, anon, authenticated;

-- Read-only for threads and roster: membership is minted by function only.
GRANT SELECT                 ON TABLE public.chat_threads      TO authenticated;
GRANT SELECT                 ON TABLE public.chat_participants TO authenticated;
-- Send, but never edit or delete: message editing and deletion are Phase 2, and
-- a grant is the only thing standing between "not built" and "quietly possible".
GRANT SELECT, INSERT         ON TABLE public.chat_messages     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.chat_reads        TO authenticated;

GRANT ALL ON TABLE public.chat_threads      TO service_role;
GRANT ALL ON TABLE public.chat_participants TO service_role;
GRANT ALL ON TABLE public.chat_messages     TO service_role;
GRANT ALL ON TABLE public.chat_reads        TO service_role;

-- ── Thread ordering ─────────────────────────────────────────────────────────
-- A trigger rather than an aggregate over `chat_messages`: the conversation
-- list is the hottest read in the feature and sorting it must not scan messages.
CREATE OR REPLACE FUNCTION public.chat_touch_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.chat_threads
     SET last_message_at = NEW.created_at
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_thread ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_thread
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_touch_thread();

-- ── Membership minting ──────────────────────────────────────────────────────
/**
 * 🚨 ANONYMOUS SESSIONS ARE REFUSED HERE TOO, NOT ONLY IN THE API ROUTE.
 *
 * B17: an anonymous user IS a user — a real `auth.users` row with
 * `is_anonymous = true` — so every `if (!user) return 401` in the app passed
 * them straight through, and a UAT probe liked, saved, followed, commented and
 * created a group on an anonymous session. The API routes call
 * `refuseAnonymousSocialWrite`, and this is the second lock: a route added
 * later that forgets the helper still cannot mint a thread.
 */
CREATE OR REPLACE FUNCTION public.chat_start_direct(p_target UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_key    TEXT;
  v_thread UUID;
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

  v_key := LEAST(v_me::text, p_target::text) || ':' || GREATEST(v_me::text, p_target::text);

  -- The race is the point. Two people tapping each other at the same moment
  -- both reach this line; the unique index lets exactly one insert through and
  -- the other falls to the SELECT below with the winner's id.
  INSERT INTO public.chat_threads (kind, direct_key, created_by)
       VALUES ('direct', v_key, v_me)
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
$$;

REVOKE EXECUTE ON FUNCTION public.chat_start_direct(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_start_direct(UUID) TO authenticated;

/**
 * Groups. Unlike direct threads these are NOT deduplicated: two groups with the
 * same members are two different groups, which is why `direct_key` stays NULL.
 */
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

REVOKE EXECUTE ON FUNCTION public.chat_create_group(TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_create_group(TEXT, UUID[]) TO authenticated;

-- ── Conversation list ───────────────────────────────────────────────────────
/**
 * The list read, in one round trip.
 *
 * 🔑 SECURITY INVOKER (the default) — deliberately NOT definer. Everything here
 * is already scoped by the policies above, so running as the caller means this
 * function cannot widen anyone's view even by accident; it is a query shape, not
 * a privilege. `chat_is_participant` stays definer only because RLS recursion
 * leaves no alternative.
 *
 * 🚨 UNREAD IS DERIVED, NEVER STORED. It counts messages newer than the caller's
 * cursor that the caller did not send. A stored integer drifts the first time a
 * message is inserted by a path that forgets to bump it — and "you have 3
 * unread" pointing at an empty thread is the bug users report as "the app is
 * lying to me". `-infinity` is the default cursor, so a thread never opened
 * counts every message from the other side.
 */
CREATE OR REPLACE FUNCTION public.chat_thread_summaries()
RETURNS TABLE (
  thread_id       UUID,
  kind            TEXT,
  title           TEXT,
  last_message_at TIMESTAMPTZ,
  last_body       TEXT,
  last_sender_id  UUID,
  last_created_at TIMESTAMPTZ,
  unread_count    INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
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
  ORDER BY t.last_message_at DESC
  LIMIT 100;
$$;

REVOKE EXECUTE ON FUNCTION public.chat_thread_summaries() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_thread_summaries() TO authenticated;

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Same mechanism `notifications` already uses in production. The client
-- subscribes to INSERTs on this table with NO filter: the SELECT policy above
-- is evaluated per subscriber, so a user is delivered messages from their own
-- threads and nothing else. A filter would have to name one thread, which would
-- leave the conversation list deaf to every other thread.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
