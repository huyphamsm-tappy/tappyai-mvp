-- Rollback for 20260925d_audit_log_pii_retention.sql.
-- Restores the original verifier (20260807_audit_chain.sql §6) and removes the PII trigger, the
-- side table (IP/UA held there are LOST), the anchors and the sweep/prune functions.
-- 🚨 If audit_log_prune() ever ran, the restored verifier reports the first remaining row as
-- prev_mismatch + sequence_gap — the anchor was the only record of the pruned head. Do not roll back
-- after a prune without exporting audit_log_anchor first.
-- actor_email stays NULLABLE: rows written since contain NULL, so NOT NULL cannot be restored.
DROP TRIGGER IF EXISTS aaa_audit_log_pii ON public.audit_log;
DROP FUNCTION IF EXISTS public.fn_audit_log_pii();
DROP FUNCTION IF EXISTS public.fn_audit_mask(JSONB);
DROP FUNCTION IF EXISTS public.audit_log_client_sweep(INTEGER);
DROP FUNCTION IF EXISTS public.audit_log_prune(INTEGER);
DROP TABLE IF EXISTS public.audit_log_client;
DROP TABLE IF EXISTS public.audit_log_anchor;

CREATE OR REPLACE FUNCTION fn_verify_audit_chain(
  p_from BIGINT DEFAULT NULL,
  p_to   BIGINT DEFAULT NULL
)
RETURNS TABLE(seq BIGINT, id UUID, problem TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $verify$
DECLARE
  r          RECORD;
  v_expected BYTEA;
  v_actual   BYTEA;
  v_last_seq BIGINT := NULL;
BEGIN
  -- An inverted range selects no rows, and an integrity tool that answers
  -- "clean" to a question it never asked is a false assurance. Fail loudly.
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'fn_verify_audit_chain: p_from (%) is greater than p_to (%)', p_from, p_to
      USING ERRCODE = '22023';
  END IF;

  -- Ranged verification starts from the predecessor's stored hash, so the
  -- Controller can check a recent window without walking a million rows.
  -- A-2 (adversarial review): a full scan previously skipped this comparison
  -- for the FIRST row, so its prev_hash was never checked and the leading gap was never
  -- reported. `DELETE FROM audit_log WHERE seq <= 3` therefore verified clean.
  -- That is not the documented tail-truncation limit (T-03, which genuinely
  -- needs an external anchor): the chain already carries what is needed to
  -- catch it, because a truncated head leaves a prev_hash pointing at nothing.
  --
  -- Anchoring at NULL discriminates correctly:
  --   genesis                    prev_hash NULL  -> matches, clean
  --   head deleted               prev_hash set   -> prev_mismatch + sequence_gap
  --   first seq burnt by rollback prev_hash NULL -> matches, still clean
  IF p_from IS NOT NULL THEN
    SELECT a.row_hash, a.seq INTO v_expected, v_last_seq
      FROM audit_log a WHERE a.seq < p_from ORDER BY a.seq DESC LIMIT 1;
  ELSE
    v_expected := NULL;
    v_last_seq := 0;
  END IF;

  FOR r IN
    SELECT * FROM audit_log a
    WHERE (p_from IS NULL OR a.seq >= p_from)
      AND (p_to   IS NULL OR a.seq <= p_to)
    ORDER BY a.seq
  LOOP
    IF r.row_hash IS NULL THEN
      -- Reachable only if the trigger was disabled for the insert.
      seq := r.seq; id := r.id; problem := 'unchained'; RETURN NEXT;
      v_last_seq := r.seq;
      v_expected := NULL;
      CONTINUE;
    END IF;

    v_actual := fn_audit_row_hash(
        r.prev_hash, r.seq, r.id, r.actor_id, r.actor_email, r.actor_role, r.action,
        r.target_type, r.target_id, r.before_state, r.after_state,
        r.metadata, r.ip_address, r.user_agent, r.created_at);

    IF v_actual IS DISTINCT FROM r.row_hash THEN
      seq := r.seq; id := r.id; problem := 'hash_mismatch'; RETURN NEXT;
    END IF;

    IF r.prev_hash IS DISTINCT FROM v_expected THEN
      seq := r.seq; id := r.id; problem := 'prev_mismatch'; RETURN NEXT;
      IF v_last_seq IS NOT NULL AND r.seq - v_last_seq > 1 THEN
        seq := v_last_seq + 1; id := NULL; problem := 'sequence_gap'; RETURN NEXT;
      END IF;
    END IF;

    -- Chain on the RECOMPUTED hash so an edit propagates to the successor.
    v_expected := v_actual;
    v_last_seq := r.seq;
  END LOOP;

  RETURN;
END
$verify$;

-- CREATE OR REPLACE keeps the ACL; restated so this file stands alone (ADR-019).
REVOKE EXECUTE ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) TO service_role;
