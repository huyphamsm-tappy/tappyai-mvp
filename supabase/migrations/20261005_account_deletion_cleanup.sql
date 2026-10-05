-- ---------------------------------------------------------------------------
-- Account deletion clean-up (Apple 5.1.1(v) in-app deletion) - production-safe subset of F-093 / F-096.
--
-- WHY THIS IS NOT THE p7 D1 / D2 / D4 FILES
--   * D1 (20260911b) changes user_memory.user_id text -> uuid and DELETES orphan rows while doing it.
--   * D4 (20260925c) reads public.shared_results, a G1 table production does not have: its
--     'public.shared_results'::regclass lookup raises on production.
--   This file needs neither. It changes NO existing column, constraint, policy or row; it only
--   ADDS one queue table, one trigger function + trigger, and one read-only readiness function.
--   Every statement is idempotent (applying it twice is a no-op).
--
-- WHAT DELETING AN ACCOUNT TAKES WITH IT (measured on the production catalog, 2026-10-05)
--   * Most per-user tables already cascade (directly from auth.users, or through public.profiles).
--   * Four stores do NOT, so the trigger below removes them itself, in the same transaction:
--       public.user_memory      (user_id is TEXT, no foreign key)
--       public.decision_evidence(owner_id, no foreign key)
--       public.anon_chat_usage  (user_id, no foreign key)
--       public.notifications    rows the user CAUSED in other people's inboxes (actor_id is SET NULL,
--                               which would leave a notification carrying the user's name and a quote)
--   * Uploaded files (GCS) and the Google Calendar grant live outside the database: the trigger QUEUES
--     them in public.account_deletion_jobs and /api/cron/account-deletion-jobs drains the queue.
--   * Messages to other people are ANONYMISED (sender SET NULL) and moderation history is kept - unchanged.
--
-- The trigger runs BEFORE DELETE on auth.users, so a deletion from the Supabase dashboard is covered
-- exactly like one from the app. BEFORE, not AFTER: the rows it reads (the user's groups, their Google
-- tokens) are removed by the same statement's cascades. If any statement here fails the whole deletion
-- rolls back: an account is either fully deleted or untouched, never half-processed.
--
-- READINESS GATE: public.account_deletion_ready() answers true only when this migration is in place.
-- The app turns in-app deletion on only when that is true AND ACCOUNT_SELF_DELETE_ENABLED=true, so the
-- environment flag can never switch deletion on ahead of its clean-up.
--
-- GATE: apply to production under the owner's authorisation (it adds a trigger on auth.users).
-- ---------------------------------------------------------------------------

-- The deletion queue. No FK to auth.users on purpose: the account is gone by the time a worker reads
-- the row. Locked down: RLS on, no policy, no client grant.
CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL,
  -- Groups the user CREATED (they cascade away with the account; their avatar files must follow).
  group_ids      UUID[]      NOT NULL DEFAULT '{}',
  -- Google Calendar tokens to revoke at Google. Exactly as user_integrations holds them; the worker
  -- clears them as soon as they are revoked.
  google_tokens  TEXT[]      NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts       INTEGER     NOT NULL DEFAULT 0,
  last_error     TEXT,
  media_deleted  INTEGER,
  done_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS account_deletion_jobs_pending_idx
  ON public.account_deletion_jobs (created_at) WHERE done_at IS NULL;
ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
-- New tables are born open to every API role (platform default privileges). Close all of them, service_role included, then give the
-- worker back only what it needs: it reads jobs and marks them done. INSERT happens in the SECURITY DEFINER trigger, as the owner.
REVOKE ALL ON TABLE public.account_deletion_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.account_deletion_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.fn_enqueue_account_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.account_deletion_jobs (user_id, group_ids, google_tokens)
  VALUES (
    OLD.id,
    COALESCE((SELECT array_agg(g.id) FROM public.groups g WHERE g.creator_id = OLD.id), '{}'),
    COALESCE((SELECT array_agg(t.tok) FROM (
        SELECT COALESCE(i.refresh_token, i.access_token) AS tok
          FROM public.user_integrations i
         WHERE i.user_id = OLD.id AND i.provider = 'google_calendar'
      ) t WHERE t.tok IS NOT NULL), '{}')
  );

  -- Stores with no cascade path from auth.users (see the header). Scoped to exactly this user.
  DELETE FROM public.user_memory       WHERE user_id  = OLD.id::text;
  DELETE FROM public.decision_evidence WHERE owner_id = OLD.id;
  DELETE FROM public.anon_chat_usage   WHERE user_id  = OLD.id;
  DELETE FROM public.notifications     WHERE actor_id = OLD.id;

  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_enqueue_account_deletion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enqueue_account_deletion ON auth.users;
CREATE TRIGGER trg_enqueue_account_deletion
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_account_deletion();

-- Read-only readiness probe for the app. Reveals one boolean about this database's schema, nothing else.
CREATE OR REPLACE FUNCTION public.account_deletion_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_regclass('public.account_deletion_jobs') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_trigger t
        WHERE t.tgname = 'trg_enqueue_account_deletion'
          AND t.tgrelid = 'auth.users'::regclass
          AND NOT t.tgisinternal
          AND t.tgenabled <> 'D'
     );
$$;
-- ADR-019: REVOKE FROM PUBLIC alone closes nothing on Supabase (default privileges grant anon/authenticated by name), so name them,
-- then grant back ONLY the roles that call it: the app asks with the public anon key, signed-in clients and the server may too.
REVOKE ALL ON FUNCTION public.account_deletion_ready() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_ready() TO anon, authenticated, service_role;
