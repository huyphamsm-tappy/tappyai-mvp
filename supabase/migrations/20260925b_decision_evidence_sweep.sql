-- ---------------------------------------------------------------------------
-- decision_evidence — the sweep its 2-hour TTL never had (F-097)
--
-- Additive: one function and its grants. No table, column or policy changes.
--
-- GATE: applied to production ONLY under explicit Owner authorization
-- (DEPLOY-CHECKLIST D3). Until it is applied, the daily cron that calls it
-- (/api/cron/decision-evidence-sweep) fails harmlessly with "function not found".
-- ---------------------------------------------------------------------------
-- WHY
-- 20260824_decision_evidence_state.sql gives every row a 2-hour TTL, but expiry
-- is enforced only on READ, and a row is reclaimed only by the SAME owner's next
-- decision_evidence_save(). An owner who never returns keeps their rows forever:
-- on the audit database 23 of 26 rows were past expires_at (2026-09-25).
--
-- WHAT
-- decision_evidence_sweep(p_limit) deletes up to p_limit rows whose expires_at
-- has passed, oldest first, and returns how many it deleted. It never touches an
-- unexpired row — the predicate is the whole contract, and the DB test proves it.
--
-- WHO MAY CALL IT
-- service_role only (the cron route's admin client). Not anon, not authenticated:
-- a user must not be able to trigger a global delete, even of expired rows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decision_evidence_sweep(p_limit INTEGER DEFAULT 5000)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    RETURN 0;
  END IF;

  WITH doomed AS (
    SELECT id FROM public.decision_evidence
     WHERE expires_at < now()
     ORDER BY expires_at
     LIMIT LEAST(p_limit, 50000)
  )
  DELETE FROM public.decision_evidence d
   USING doomed
   WHERE d.id = doomed.id
     AND d.expires_at < now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.decision_evidence_sweep(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decision_evidence_sweep(INTEGER) TO service_role;
