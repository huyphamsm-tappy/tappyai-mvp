-- ============================================================================
-- ROLLBACK for
--   20260905_chat_messaging_phase1.sql          (Social messaging, Phase 1)
--   20260906_phase6_messenger_reachability.sql  (Phase 6 — reachability + blocks)
--
-- NOT applied automatically. Kept beside the migrations so the rollback is a
-- rehearsed file rather than something improvised during an incident.
--
-- Scope: EXACTLY the objects those two files introduce, and nothing else.
--   tables     chat_threads, chat_participants, chat_messages, chat_reads,
--              chat_blocks, chat_settings
--   indexes    chat_threads_direct_key_uniq, chat_threads_last_message_idx,
--              chat_participants_user_idx, chat_messages_thread_created_idx,
--              chat_blocks_blocked_idx                 (dropped WITH their tables)
--   policies   the 7 Phase-1 + 4 Phase-6 policies    (dropped WITH their tables)
--   trigger    chat_messages_touch_thread              (dropped WITH its table)
--   functions  chat_thread_blocked, chat_can_reach, chat_start_direct,
--              chat_create_group, chat_thread_summaries, chat_touch_thread,
--              chat_is_participant
--   publication membership of chat_messages in supabase_realtime
--   grants/revokes — vanish with the objects; nothing was granted on any
--              pre-existing object.
--
-- 🚨 NOT TOUCHED, BY CONSTRUCTION: public.conversations, public.messages,
-- public.groups, public.group_members, public.user_follows, public.profiles,
-- public.notifications, auth.users, the supabase_realtime publication itself.
-- Phase 1 and Phase 6 altered none of them, so this file names none of them.
--
-- 🚨 THIS DESTROYS MESSAGING DATA. Dropping chat_threads cascades every
-- participant row, message row and read cursor written since the migrations
-- were applied. Run it to abandon the feature, never to "clean up".
--
-- Order matters and is dependency-driven:
--   0. guard   — refuse to run if a same-named table has an unexpected owner
--                shape (i.e. is not the one these migrations created);
--   1. realtime — take chat_messages out of the publication before it goes;
--   2. tables  — children before parents (FKs), so no CASCADE is needed and
--                nothing outside this list can be swept up by one;
--   3. functions — after the tables, because the policies and trigger that
--                reference them are already gone with the tables.
-- Idempotent: every statement is IF EXISTS. Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guard — every table this file drops must be a `chat_*` table in `public`
--    with the column set Phase 1 / Phase 6 gave it. Anything else is not ours.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO bad
    FROM unnest(ARRAY['chat_threads','chat_participants','chat_messages','chat_reads','chat_blocks','chat_settings']) AS t
   WHERE to_regclass('public.' || t) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = t
          AND c.column_name = CASE t
              WHEN 'chat_threads'      THEN 'direct_key'
              WHEN 'chat_participants' THEN 'joined_at'
              WHEN 'chat_messages'     THEN 'sender_id'
              WHEN 'chat_reads'        THEN 'last_read_at'
              WHEN 'chat_blocks'       THEN 'blocker_id'
              WHEN 'chat_settings'     THEN 'reachability'
            END
     );
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'rollback refused: % exists but is not the messaging table these migrations created', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Realtime — Phase 1 added chat_messages to the existing publication.
--    Remove only that membership; the publication and its other tables stay.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Tables — children first. Each drop takes its own indexes, policies,
--    constraints, grants and (for chat_messages) the touch trigger with it.
--    No CASCADE: if something outside this list ever came to depend on one of
--    these tables, this rollback must fail loudly rather than remove it.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.chat_blocks;        -- Phase 6 (FK → auth.users only)
DROP TABLE IF EXISTS public.chat_settings;      -- Phase 6 (no FKs)
DROP TABLE IF EXISTS public.chat_reads;         -- Phase 1 (FK → chat_threads)
DROP TABLE IF EXISTS public.chat_messages;      -- Phase 1 (FK → chat_threads; trigger goes with it)
DROP TABLE IF EXISTS public.chat_participants;  -- Phase 1 (FK → chat_threads)
DROP TABLE IF EXISTS public.chat_threads;       -- Phase 1 (parent)

-- ---------------------------------------------------------------------------
-- 3. Functions — Phase 6 first (they reference Phase 1's tables/functions),
--    then Phase 1. Exact signatures, so an unrelated overload can never match.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.chat_thread_blocked(UUID);          -- Phase 6
DROP FUNCTION IF EXISTS public.chat_can_reach(UUID);               -- Phase 6
DROP FUNCTION IF EXISTS public.chat_start_direct(UUID);            -- Phase 1, replaced by Phase 6
DROP FUNCTION IF EXISTS public.chat_create_group(TEXT, UUID[]);    -- Phase 1
DROP FUNCTION IF EXISTS public.chat_thread_summaries();            -- Phase 1
DROP FUNCTION IF EXISTS public.chat_touch_thread();                -- Phase 1 (trigger function)
DROP FUNCTION IF EXISTS public.chat_is_participant(UUID);          -- Phase 1 (referenced by the policies, now gone)

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification after running (all must be NULL / 0):
--   SELECT to_regclass('public.chat_threads'), to_regclass('public.chat_messages'),
--          to_regclass('public.chat_participants'), to_regclass('public.chat_reads'),
--          to_regclass('public.chat_blocks'), to_regclass('public.chat_settings'),
--          to_regprocedure('public.chat_thread_summaries()'),
--          to_regprocedure('public.chat_start_direct(uuid)'),
--          to_regprocedure('public.chat_create_group(text, uuid[])'),
--          to_regprocedure('public.chat_is_participant(uuid)'),
--          to_regprocedure('public.chat_can_reach(uuid)'),
--          to_regprocedure('public.chat_thread_blocked(uuid)'),
--          to_regprocedure('public.chat_touch_thread()');
--   SELECT count(*) FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages';
-- ---------------------------------------------------------------------------
