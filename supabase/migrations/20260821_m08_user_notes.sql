-- ============================================================================
-- Module 08 — internal admin notes: `user_notes`
--
-- GATE: NOT YET AUTHORIZED FOR PRODUCTION. Every previous migration
--       authorization named its own table and nothing else; none of them
--       covers this one. Applying it needs its own explicit Owner
--       authorization, preflight and rollback window (ADR-017 pattern).
--
-- CONTRACT
--   04_Database_Architecture.md §4.6   the DDL below, verbatim
--   10_User_Management.md §3.8         "Chronological internal notes from
--                                      user_notes. Pinned notes shown at top.
--                                      Add new note inline."
--   10_User_Management.md §3.9         "Add internal note - moderator"
--   12_RBAC.md §3                      analyst NO · moderator YES · admin YES ·
--                                      super_admin YES
--
-- ---------------------------------------------------------------------------
-- WHY THIS TABLE IS NOT LIKE THE OTHERS
--
-- Every other user-scoped table in this schema holds facts about an account.
-- This one holds an operator's OPINION of a person: free text, about a subject
-- who cannot see it and never agreed to it. Two consequences, both enforced:
--
-- 1. THE SUBJECT MUST NOT BE ABLE TO READ THEIR OWN ROW. A `user_id` column in
--    this schema normally comes with an own-row RLS policy - that reflex is
--    exactly wrong here, because it would hand every user the internal file
--    kept on them. `authenticated` gets nothing at all, and the zero-policy
--    RLS below is what makes that true rather than a convention.
--
-- 2. THE AUTHOR FK DOES NOT CASCADE, and that is §4.6's design rather than an
--    omission to tidy up. Deleting an administrator must not delete the notes
--    they wrote; an audit trail that disappears with its author is not an audit
--    trail. The SUBJECT's FK does cascade - a deleted user's file has no
--    subject left to be about.
-- ---------------------------------------------------------------------------
--
-- IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK:   supabase/migrations/rollback/20260821_m08_user_notes_rollback.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE: the subject is gone, so the file about them should be too.
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NO cascade, deliberately. See note 2 in the header.
  author_id       UUID NOT NULL REFERENCES public.profiles(id),
  note            TEXT NOT NULL,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- §4.6. Newest-first within one subject is exactly what §3.8 renders.
CREATE INDEX IF NOT EXISTS idx_user_notes_user ON public.user_notes(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- The access boundary (ADR-019).
--
-- A new table here is BORN fully open: `pg_default_acl` grants anon and
-- authenticated everything. Without these REVOKEs every internal note about
-- every user is one anonymous PostgREST GET away - and unlike a rollup table,
-- these rows name a person and describe them in prose.
--
-- `service_role` keeps access: it is the API tier's identity, and the
-- Controller reaches this table through the admin client behind the PDP.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.user_notes FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.user_notes TO service_role;

ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately (04 §8): with RLS on, a missing policy is a
-- denial, and `service_role` reaches the table by BYPASSRLS rather than policy.
-- There is NO own-row policy here on purpose - see note 1 in the header.

-- ============================================================================
-- VERIFICATION (run after apply; read-only)
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name='user_notes';                       -- service_role only
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.user_notes'::regclass;
--   SELECT count(*) FROM pg_policies WHERE tablename='user_notes';  -- 0
--   SELECT count(*) FROM public.user_notes;                          -- 0
--   SELECT conname, confdeltype FROM pg_constraint
--    WHERE conrelid='public.user_notes'::regclass AND contype='f';
--     -- user_id -> 'c' (cascade) · author_id -> 'a' (no action)
--
--   -- credential-free existence probe: PGRST205 -> 42501
-- ============================================================================
