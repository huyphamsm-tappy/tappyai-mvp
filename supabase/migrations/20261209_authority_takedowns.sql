-- ============================================================================
-- Authority takedown requests (owner 25/11/2026): the register of requests to remove content that a competent authority (or a well-founded user complaint) sends to Tappy, with the legal clock.
--
-- WHY. Vietnamese rules on online platforms (as reported by the press; a lawyer must confirm the exact articles) require content to be removed within 24 h of a competent authority's request (6 h in an
-- emergency threatening national security) and within 48 h of a well-founded user complaint, and the operator must keep logs for investigation. This table is that register: who asked, which content, when it
-- was received, when it is DUE, what was done and by whom, and a copy of the content at the time it was taken down.
--
-- WHAT IS NEW: one table, service-role only (RLS on, no policy, no grant to anon/authenticated), and a trigger that refuses DELETE (the register is kept). Nothing reads or writes it until the admin takedown
-- routes ship behind MODERATION_ADMIN_ENABLED. Additive. ROLLBACK: rollback/20261209_authority_takedowns_rollback.sql (drops the register: run only if that is intended).
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.authority_takedowns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  received_at     timestamptz NOT NULL,
  source          text NOT NULL CHECK (source IN ('authority', 'user_complaint')),
  agency          text NOT NULL CHECK (length(agency) BETWEEN 1 AND 200),
  reference_no    text NULL CHECK (reference_no IS NULL OR length(reference_no) <= 100),
  legal_basis     text NULL CHECK (legal_basis IS NULL OR length(legal_basis) <= 500),
  urgency         text NOT NULL CHECK (urgency IN ('standard_24h', 'emergency_6h', 'complaint_48h')),
  due_at          timestamptz NOT NULL,
  target_type     text NOT NULL CHECK (target_type IN ('review', 'comment', 'plan_share', 'user')),
  target_id       text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 64),
  status          text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'actioned', 'rejected', 'needs_info')),
  action_taken    text NULL CHECK (action_taken IS NULL OR action_taken IN ('hidden', 'deleted', 'banned', 'none')),
  actioned_at     timestamptz NULL,
  actioned_by     uuid NULL,
  recorded_by     uuid NOT NULL,
  content_snapshot jsonb NULL,
  notes           text NULL CHECK (notes IS NULL OR length(notes) <= 2000),
  CONSTRAINT authority_takedowns_due_after_receipt CHECK (due_at >= received_at),
  CONSTRAINT authority_takedowns_closed_has_time CHECK (status = 'received' OR status = 'needs_info' OR actioned_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS authority_takedowns_open_idx ON public.authority_takedowns (due_at) WHERE status IN ('received', 'needs_info');
CREATE INDEX IF NOT EXISTS authority_takedowns_target_idx ON public.authority_takedowns (target_type, target_id);

ALTER TABLE public.authority_takedowns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.authority_takedowns FROM PUBLIC;
REVOKE ALL ON public.authority_takedowns FROM anon, authenticated;
GRANT ALL ON public.authority_takedowns TO service_role;

-- The register is kept: nobody deletes a row (not even the service role by mistake).
CREATE OR REPLACE FUNCTION public.authority_takedowns_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'authority_takedowns rows are kept for legal records and cannot be deleted';
END;
$$;
DROP TRIGGER IF EXISTS authority_takedowns_no_delete ON public.authority_takedowns;
CREATE TRIGGER authority_takedowns_no_delete BEFORE DELETE ON public.authority_takedowns FOR EACH ROW EXECUTE FUNCTION public.authority_takedowns_no_delete();

COMMIT;

-- Check afterwards (expect: one row of 't'):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.authority_takedowns'::regclass;
