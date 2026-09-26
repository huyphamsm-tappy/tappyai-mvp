-- ---------------------------------------------------------------------------
-- F-096 — account deletion does what /delete-account promises (owner decisions 2026-09-25)
--
-- GATE: applied to production ONLY under explicit Owner authorization (DEPLOY-CHECKLIST D4),
-- after D1/D2 (F-093) and before the /delete-account copy is updated.
--
-- Account deletion is an operator deleting the Auth user (dashboard or admin API). What that
-- delete must take with it, decided by the owner per kind of content:
--
--   DELETE   publicly shared result pages   shared_results.owner_id      SET NULL → CASCADE (1)
--   DELETE   notifications to OTHER people  notifications.actor_id       SET NULL → CASCADE (2)
--            that carry the user's name and a quote of their comment in title/body
--   DELETE   uploaded files in GCS          not in the database — queued here (3), deleted by
--   REVOKE   the Google Calendar grant      /api/cron/account-deletion-jobs, which alone holds
--                                           the bucket credential (Workload Identity)
--   ANONYMISE messages to other people     chat_messages.sender_id      SET NULL — unchanged
--   ANONYMISE moderation records           moderation_* SET NULL        — unchanged
--
-- (3) The queue is filled by a BEFORE DELETE trigger on auth.users, so a deletion from the
-- Supabase dashboard is covered exactly like one from code — nobody has to remember a script.
-- BEFORE, not AFTER: the rows it reads (the user's groups, their Google tokens) are removed by
-- the same statement's cascades.
-- ---------------------------------------------------------------------------

-- (1) + (2): swap SET NULL for CASCADE on the two owner columns. Constraint names are looked up,
-- not assumed; the swap is skipped when the column already cascades (idempotent).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col, c.confdeltype
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND ((c.conrelid = 'public.shared_results'::regclass AND a.attname = 'owner_id')
         OR (c.conrelid = 'public.notifications'::regclass  AND a.attname = 'actor_id'))
  LOOP
    IF r.confdeltype <> 'c' THEN
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE CASCADE',
                     r.tbl, r.conname, r.col);
      RAISE NOTICE 'F-096: %.% now ON DELETE CASCADE', r.tbl, r.col;
    END IF;
  END LOOP;
END $$;

-- (3) The deletion queue. No FK to auth.users on purpose: the account is gone by the time a
-- worker reads the row. Locked down like decision_evidence: RLS on, no policy, no client grant.
CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL,
  -- Groups the user CREATED (they cascade away with the account; their avatar files must follow).
  group_ids      UUID[]      NOT NULL DEFAULT '{}',
  -- Google Calendar tokens to revoke at Google. Plaintext exactly as user_integrations holds them
  -- today; cleared by the worker as soon as they are revoked.
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
REVOKE ALL ON TABLE public.account_deletion_jobs FROM PUBLIC, anon, authenticated;
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
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_enqueue_account_deletion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enqueue_account_deletion ON auth.users;
CREATE TRIGGER trg_enqueue_account_deletion
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_account_deletion();
