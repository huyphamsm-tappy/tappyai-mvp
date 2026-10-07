-- ============================================================================
-- Phase 6 — Messenger reachability + block foundation (ADDITIVE)
--
-- Follows 20260905_chat_messaging_phase1.sql. That migration built a correct
-- messenger: membership minted only by SECURITY DEFINER RPC, the 1:1 race won
-- by a unique index, anonymous sessions refused inside the database.
--
-- What it did NOT have is any answer to "who may open a conversation with
-- whom". `chat_start_direct` accepted any real, non-self `auth.users` id, which
-- means:
--
--   * anyone can message anyone — a spam channel;
--   * `invalid_target` vs success is an EXISTENCE ORACLE for account ids;
--   * there is nothing for a blocked user to be blocked FROM.
--
-- This migration adds the gate. It is additive: no table is altered, no data is
-- touched, and the only replaced object is `chat_start_direct`, whose signature
-- and return value are unchanged.
--
-- GATE: NOT AUTHORIZED FOR PRODUCTION. Neither this nor the Phase 1 migration
-- it extends has been applied anywhere. Applying needs its own Owner
-- authorization, preflight and rollback window (ADR-017).
--
-- Idempotent. Grants follow ADR-019.
-- ============================================================================

-- ── Blocks ──────────────────────────────────────────────────────────────────
-- The minimum that makes "block" mean something: a directed pair. Restrict and
-- report are deliberately NOT modelled here — they are different product
-- decisions with different UX, and inventing their semantics now would be
-- guessing. This table is the foundation they would build on.
CREATE TABLE IF NOT EXISTS public.chat_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (blocker_id <> blocked_id),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- The lookup the gate performs, in both directions.
CREATE INDEX IF NOT EXISTS chat_blocks_blocked_idx ON public.chat_blocks (blocked_id);

ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- You may read, create and remove YOUR OWN blocks. You may never read who has
  -- blocked you: that is a fact about someone else's account, and exposing it
  -- turns a safety feature into a notification for the person being avoided.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_blocks' AND policyname='chat_blocks_select_own') THEN
    CREATE POLICY "chat_blocks_select_own" ON public.chat_blocks
      FOR SELECT USING (blocker_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_blocks' AND policyname='chat_blocks_insert_own') THEN
    CREATE POLICY "chat_blocks_insert_own" ON public.chat_blocks
      FOR INSERT WITH CHECK (blocker_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_blocks' AND policyname='chat_blocks_delete_own') THEN
    CREATE POLICY "chat_blocks_delete_own" ON public.chat_blocks
      FOR DELETE USING (blocker_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON TABLE public.chat_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.chat_blocks TO authenticated;
GRANT ALL ON TABLE public.chat_blocks TO service_role;

-- ── Reachability policy, as configuration ───────────────────────────────────
--
-- 🔑 THE POLICY LIVES IN THE DATABASE, NOT IN AN ENVIRONMENT VARIABLE.
--
-- `chat_start_direct` is a SECURITY DEFINER RPC that `authenticated` may call
-- directly. A reachability check written in TypeScript would therefore enforce
-- nothing at all: a client that skips the route and calls the RPC bypasses it.
-- The gate has to be where the RPC is, and the RPC cannot read process.env.
--
-- A one-row table gives Phase 4 the configurability it needs (change the row,
-- no deploy) while keeping the DEFAULT conservative.
CREATE TABLE IF NOT EXISTS public.chat_settings (
  id         BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),  -- exactly one row
  /**
   * mutual_follow            both users follow each other  (DEFAULT)
   * recipient_follows_sender the recipient opted into hearing from the sender
   * anyone                   open messaging
   *
   * 🚨 The default is the most restrictive rule that still permits a real
   * conversation. Phase 4 owns the final product policy; until it decides,
   * shipping must not silently mean "anyone can message anyone".
   */
  reachability TEXT NOT NULL DEFAULT 'mutual_follow'
               CHECK (reachability IN ('mutual_follow', 'recipient_follows_sender', 'anyone')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.chat_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Read-only to clients, and only so a UI can explain the rule. Writes are an
-- operator action through the service role.
ALTER TABLE public.chat_settings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_settings' AND policyname='chat_settings_select_all') THEN
    CREATE POLICY "chat_settings_select_all" ON public.chat_settings FOR SELECT USING (true);
  END IF;
END $$;
REVOKE ALL ON TABLE public.chat_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.chat_settings TO authenticated;
GRANT ALL    ON TABLE public.chat_settings TO service_role;

-- ── The gate ────────────────────────────────────────────────────────────────
/**
 * May the CALLER open a conversation with `p_target`?
 *
 * SECURITY DEFINER for one reason: it reads `public.chat_blocks`, whose SELECT
 * policy deliberately hides "who blocked me". Answering the question needs to
 * see both directions; the caller must not.
 *
 * It answers only about `auth.uid()` — there is no argument for "as whom" — so
 * it cannot be used to probe anyone else's relationships. It returns a bare
 * boolean and never says WHY, because "not reachable" and "no such account"
 * must be indistinguishable.
 */
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

REVOKE EXECUTE ON FUNCTION public.chat_can_reach(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_can_reach(UUID) TO authenticated, service_role;

-- ── chat_start_direct, gated ────────────────────────────────────────────────
--
-- Replaced, not altered: same name, same signature, same return value, so every
-- caller is unaffected. The ONLY behavioural change is the reachability check,
-- and the failure it raises is the SAME `invalid_target` a non-existent account
-- raises — deliberately, so the RPC cannot be used to discover which account
-- ids are real.
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

  -- 🚨 THE GATE. Same error, same code, same message as "no such account": a
  -- caller must not be able to tell "that account does not exist" from "that
  -- account exists and will not hear from you". Distinguishing them turns this
  -- RPC into a user-enumeration oracle.
  IF NOT public.chat_can_reach(p_target) THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  v_key := LEAST(v_me::text, p_target::text) || ':' || GREATEST(v_me::text, p_target::text);

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
$fn$;

REVOKE EXECUTE ON FUNCTION public.chat_start_direct(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_start_direct(UUID) TO authenticated;

-- ── Blocks stop messages, not just thread creation ──────────────────────────
/**
 * True when the caller is blocked by, or has blocked, anyone else in `p_thread`.
 *
 * Without this, blocking after a thread already exists would stop nothing: the
 * thread is created once and every later message rides the existing membership.
 */
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

REVOKE EXECUTE ON FUNCTION public.chat_thread_blocked(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_thread_blocked(UUID) TO authenticated, service_role;

-- The send policy gains the block condition. Reading is deliberately untouched:
-- blocking someone must not erase the history you already have with them.
DROP POLICY IF EXISTS "chat_messages_insert_participant" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_participant" ON public.chat_messages
  FOR INSERT WITH CHECK (
    public.chat_is_participant(thread_id)
    AND sender_id = auth.uid()
    AND NOT public.chat_thread_blocked(thread_id)
  );
