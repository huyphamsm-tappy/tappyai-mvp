-- ============================================================================
-- Phase 2 · Step 3 — Activation dimension extension
-- Approved spec: docs/backoffice/phase-reports/PHASE_2_ACTIVATION_ANALYTICS_SPEC.md
--   §5 (correlation strategy), §14 item 1/4 (DB changes)
--
-- SR-1: NO new identity dimension. Activation state extends the existing
--       user_acquisition row (2 nullable columns), never a parallel table.
-- SR-5: activation_rule_version travels with activated_at so future rule
--       versions never collide with or overwrite prior history.
-- SR-4: first-write-wins merge logic lives ONCE, in a sibling upsert function,
--       exactly mirroring fn_upsert_user_acquisition's existing pattern.
--
-- Idempotent + additive. Touches no existing column, function, or RLS policy.
-- NOT APPLIED to any database as part of this step — file only, per the
-- standing "do not apply migrations" instruction.
-- ============================================================================

-- 1. Dimension extension (spec §5, §14 item 1)
ALTER TABLE public.user_acquisition
  ADD COLUMN IF NOT EXISTS activated_at           timestamptz,
  ADD COLUMN IF NOT EXISTS activation_rule_version text;

-- 2. Single reusable writer for activation state (SR-4), sibling to
--    fn_upsert_user_acquisition — first-write-wins: an already-recorded
--    activation is never overwritten by a later evaluation.
CREATE OR REPLACE FUNCTION public.fn_upsert_activation(
  p_user_id             uuid,
  p_activated_at         timestamptz,
  p_activation_rule_version text
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.user_acquisition ua
  SET activated_at            = COALESCE(ua.activated_at, p_activated_at),
      activation_rule_version = COALESCE(ua.activation_rule_version, p_activation_rule_version),
      updated_at              = now()
  WHERE ua.user_id = p_user_id
    AND ua.activated_at IS NULL;
$$;
