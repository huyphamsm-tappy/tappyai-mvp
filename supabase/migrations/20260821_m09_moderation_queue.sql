-- ============================================================================
-- Module 09 Content Moderation - `moderation_queue`, `moderation_actions`
-- and the ingestion that fills them.
--
-- GATE: NOT YET AUTHORIZED FOR PRODUCTION. Every previous authorization named
--       its own table; none covers these. Applying this needs its own explicit
--       Owner authorization, preflight and rollback window (ADR-017 pattern).
--
-- CONTRACT
--   04 §4.4 / §4.5      the two tables and three enums, reproduced VERBATIM
--   12_RBAC §3          the seven actions and their roles
--   12_HUB_TAXONOMY §1  Content Moderation belongs to `tappy.hub.user`
--   ADR-026             Owner Decision B - reporter provenance
--
-- ---------------------------------------------------------------------------
-- ADR-026 IS THE REASON THE INGESTION LOOKS ASYMMETRIC
--
-- Two report tables already exist in production and they disagree about
-- identity, deliberately:
--
--   music_track_reports   reporter_id UUID -> auth.users   the raw id
--   content_reports       reporter_source_id TEXT          OPAQUE and
--                                                          NON-REVERSIBLE; the
--                                                          raw id is absent
--
-- `content_reports` says why in its own comments: "a report set is a map of who
-- reported whom". §4.4 asks for `reported_by UUID`, which that table was built
-- not to have and could not supply - the derivation is one-way.
--
-- Owner Decision B, 2026-08-21:
--   · content-safety reports  -> reported_by NULL, opaque id into `metadata`
--   · music reports           -> reported_by = the real reporter id, unchanged
--
-- The content-safety branch therefore NEVER references `profiles` or
-- `auth.users`. There is nothing to join on, and a future column that made a
-- join possible would break ADR-026 without anything failing.
-- ---------------------------------------------------------------------------
--
-- IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK:   supabase/migrations/rollback/20260821_m09_moderation_queue_rollback.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums - §4.4 and §4.5, label for label.
--    `CREATE TYPE` has no IF NOT EXISTS, so each is guarded.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE moderation_type AS ENUM (
    'review_report', 'comment_report', 'user_report', 'music_report', 'ai_flag'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE moderation_status AS ENUM ('pending', 'in_review', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE moderation_action_type AS ENUM (
    'warn', 'hide_content', 'restore_content', 'suspend_user', 'unsuspend_user',
    'ban_user', 'restore_user', 'delete_content', 'dismiss_report'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. The queue - §4.4, verbatim.
--
--    `reported_by` is NULLABLE in §4.4 already, and under ADR-026 a NULL there
--    is a FACT ABOUT THE SOURCE rather than missing data: it says the report
--    came from a channel that does not hold identity.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            moderation_type NOT NULL,
  status          moderation_status NOT NULL DEFAULT 'pending',
  priority        SMALLINT NOT NULL DEFAULT 1, -- 1=normal, 2=high, 3=urgent
  reported_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type     TEXT NOT NULL,      -- 'review' | 'comment' | 'user' | 'music_track'
  target_id       UUID NOT NULL,
  reason          TEXT,
  metadata        JSONB,              -- Snapshot of reported content
  assigned_to     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

-- The worklist order: oldest urgent item first among what is still open.
CREATE INDEX IF NOT EXISTS idx_modq_status ON public.moderation_queue(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_modq_target ON public.moderation_queue(target_type, target_id);

-- One queue row per source report. Ingestion is a repeated batch, so without
-- this a re-run would file the same complaint again - and duplicate rows in a
-- moderation queue read as corroboration, which is the exact failure
-- `content_reports`' own UNIQUE constraint exists to prevent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_modq_source
  ON public.moderation_queue ((metadata->>'source_table'), (metadata->>'source_id'))
  WHERE metadata ? 'source_id';

-- ---------------------------------------------------------------------------
-- 3. The decision history - §4.5, verbatim.
--
--    `queue_id ON DELETE SET NULL`: a moderator's decision must OUTLIVE the
--    report that prompted it. `actor_id` has no cascade at all - the same rule
--    `user_notes` follows, for the same reason.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id        UUID REFERENCES public.moderation_queue(id) ON DELETE SET NULL,
  action          moderation_action_type NOT NULL,
  actor_id        UUID NOT NULL REFERENCES public.profiles(id),
  target_user_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_content_id UUID,
  reason          TEXT NOT NULL,
  duration_hours  INTEGER,            -- For suspensions; NULL = permanent
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_actions_actor  ON public.moderation_actions(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON public.moderation_actions(target_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. The access boundary (ADR-019).
--
--    Born fully open. Without these REVOKEs the entire report set - who
--    reported what, and every moderator decision - is one anonymous PostgREST
--    GET away. `content_reports` has no SELECT policy for exactly this reason;
--    ingesting into a readable table would undo that in one step (ADR-026 I-6).
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.moderation_queue   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.moderation_actions FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.moderation_queue   TO service_role;
GRANT  ALL ON TABLE public.moderation_actions TO service_role;

ALTER TABLE public.moderation_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately (04 §8): with RLS on, a missing policy is a
-- denial, and `service_role` reaches these by BYPASSRLS rather than policy.

-- ---------------------------------------------------------------------------
-- 5. Ingestion.
--
--    INSERT-ONLY, never an update. The queue is a WORKLIST, not a mirror of the
--    report tables: once a moderator has resolved an item, a later run must not
--    reopen it. `ON CONFLICT DO NOTHING` against `uq_modq_source` is what makes
--    a repeated run idempotent without touching a decision.
--
--    No new cron: called from `analytics-snapshot` (05:00 UTC / 00:05 VN),
--    which already runs daily and already carries every other rollup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ingest_moderation_reports()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- MUSIC REPORTS. This table stores the raw reporter id and always has; §4.4's
  -- `reported_by` is exactly what it holds, so it is carried straight through.
  INSERT INTO public.moderation_queue
    (type, status, priority, reported_by, target_type, target_id, reason, metadata, created_at)
  SELECT
    'music_report'::moderation_type,
    'pending'::moderation_status,
    1,
    r.reporter_id,
    'music_track',
    r.track_id,
    r.reason,
    jsonb_build_object('source_table', 'music_track_reports', 'source_id', r.id::text),
    r.created_at
  FROM public.music_track_reports r
  ON CONFLICT DO NOTHING;

  -- CONTENT-SAFETY REPORTS. ADR-026: `reported_by` is NULL and the opaque
  -- `reporter_source_id` goes into `metadata` instead.
  --
  -- Note what is NOT here: no join to `profiles`, no join to `auth.users`,
  -- no lookup of any kind. There is nothing to join on - the source id is
  -- derived one-way - and adding one would break ADR-026 silently.
  INSERT INTO public.moderation_queue
    (type, status, priority, reported_by, target_type, target_id, reason, metadata, created_at)
  SELECT
    'review_report'::moderation_type,
    'pending'::moderation_status,
    1,
    NULL,
    'review',
    c.content_id,
    c.reason,
    jsonb_build_object(
      'source_table', 'content_reports',
      'source_id', c.id::text,
      -- Opaque provenance. Distinguishes sources; identifies none.
      'reporter_source_id', c.reporter_source_id,
      'policy_id', c.policy_id,
      'verification_state', c.verification_state
    ),
    c.created_at
  FROM public.content_reports c
  ON CONFLICT DO NOTHING;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ingest_moderation_reports() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ingest_moderation_reports() TO service_role;

-- ============================================================================
-- VERIFICATION (run after apply; read-only)
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name IN ('moderation_queue','moderation_actions');
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('moderation_queue','moderation_actions');
--   SELECT count(*) FROM pg_policies WHERE tablename LIKE 'moderation_%';   -- 0
--   SELECT count(*) FROM public.moderation_queue;                          -- 0
--   SELECT t.typname, count(*) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
--    WHERE t.typname LIKE 'moderation%' GROUP BY t.typname;                -- 5/4/9
--
--   -- ADR-026 I-4: content_reports must be UNCHANGED
--   SELECT column_name FROM information_schema.columns WHERE table_name='content_reports';
--
--   -- credential-free existence probe: PGRST205 -> 42501
-- ============================================================================
