-- ---------------------------------------------------------------------------
-- F-096 · audit_log personal data and retention (owner decisions 2026-09-25)
--
-- GATE: applied to production ONLY under explicit Owner authorization (DEPLOY-CHECKLIST D5).
--
--   1. No email in new audit rows. "Not storing it is simpler than deleting it."
--      actor_id identifies the actor while the account exists; actor_email is set to NULL on
--      every insert, whatever the writer passed (the app writer, and the SQL functions that
--      insert audit rows directly, all go through the trigger below).
--   2. IP address and user-agent go to a side table, audit_log_client, kept 90 days.
--      The chained row keeps only metadata.client_digest = sha256(salt || ip || '\n' || ua)
--      with a per-row random salt stored beside the values: while the side row exists the
--      digest proves it was not altered; once the side row is swept the digest reveals nothing.
--   3. Sensitive values in before_state / after_state / metadata are masked ("***") by key:
--      date of birth, phone, email, address, national id / passport, tokens, passwords.
--      (The date-of-birth correction path already records only an age BAND, never the date —
--      20260908_user_demographics_foundation.sql:485 — the mask is the backstop for any writer.)
--   4. The chain keeps 12 months. audit_log_prune() removes a verified prefix and records an
--      ANCHOR (the last removed row's seq + row_hash); fn_verify_audit_chain starts from the
--      anchor, so a pruned chain still verifies clean while an unanchored head deletion is still
--      reported (A-2 unchanged). A prefix that does not verify is never pruned — pruning must
--      not launder tampering.
--
-- The chain function and its hash are UNCHANGED. The new BEFORE INSERT trigger is named
-- 'aaa_…' so it fires BEFORE 'zzz_audit_log_chain' (name order): the chain hashes what this
-- trigger produced — the ordering rule 20260807_audit_chain.sql §3 documents.
-- Rows written before this migration keep their email/IP/UA until they age out at 12 months;
-- they are not rewritten, because rewriting a chained row is indistinguishable from tampering.
-- ---------------------------------------------------------------------------

ALTER TABLE public.audit_log ALTER COLUMN actor_email DROP NOT NULL;

-- 2. The side table. No FK to audit_log: the side row is written by the BEFORE trigger (the
-- audit row does not exist yet) and the two are retained on different clocks.
CREATE TABLE IF NOT EXISTS public.audit_log_client (
  audit_id    UUID        PRIMARY KEY,
  ip_address  INET,
  user_agent  TEXT,
  salt        BYTEA       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_client_created_idx ON public.audit_log_client (created_at);
ALTER TABLE public.audit_log_client ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_log_client FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_log_client TO service_role;

-- 3. Masking, recursive over objects. Keys only — values are never parsed.
CREATE OR REPLACE FUNCTION public.fn_audit_mask(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN p;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(e.key,
             CASE
               WHEN e.key ~* '^(date_?of_?birth|dob|birth_?date|birthday|phone(_?number)?|email|e_?mail|address|street|id_?number|national_?id|citizen_?id|cccd|cmnd|passport(_?number)?|password|secret|token|access_?token|refresh_?token|ip|ip_?address|user_?agent)$'
                 THEN to_jsonb('***'::TEXT)
               WHEN jsonb_typeof(e.value) = 'object' THEN public.fn_audit_mask(e.value)
               ELSE e.value
             END)
      FROM jsonb_each(p) AS e), '{}'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_audit_mask(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_audit_log_pii()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_salt BYTEA;
BEGIN
  NEW.actor_email  := NULL;
  NEW.before_state := public.fn_audit_mask(NEW.before_state);
  NEW.after_state  := public.fn_audit_mask(NEW.after_state);
  NEW.metadata     := public.fn_audit_mask(NEW.metadata);

  IF NEW.ip_address IS NOT NULL OR NEW.user_agent IS NOT NULL THEN
    -- 16 random bytes from the built-in uuid generator (no pgcrypto dependency).
    v_salt := decode(replace(gen_random_uuid()::TEXT, '-', ''), 'hex');
    INSERT INTO public.audit_log_client (audit_id, ip_address, user_agent, salt)
    VALUES (NEW.id, NEW.ip_address, NEW.user_agent, v_salt);
    IF NEW.metadata IS NULL OR jsonb_typeof(NEW.metadata) = 'object' THEN
      NEW.metadata := COALESCE(NEW.metadata, '{}'::JSONB) || jsonb_build_object('client_digest',
        encode(sha256(v_salt || convert_to(COALESCE(host(NEW.ip_address), '') || E'\n' || COALESCE(NEW.user_agent, ''), 'UTF8')), 'hex'));
    END IF;
    NEW.ip_address := NULL;
    NEW.user_agent := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_audit_log_pii() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aaa_audit_log_pii ON public.audit_log;
CREATE TRIGGER aaa_audit_log_pii
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_pii();

-- 2. Retention of the side table: 90 days.
CREATE OR REPLACE FUNCTION public.audit_log_client_sweep(p_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RETURN 0;
  END IF;
  DELETE FROM public.audit_log_client WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_log_client_sweep(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log_client_sweep(INTEGER) TO service_role;

-- 4. Anchors and the prune.
CREATE TABLE IF NOT EXISTS public.audit_log_anchor (
  seq            BIGINT      PRIMARY KEY,
  row_hash       BYTEA       NOT NULL,
  pruned_rows    INTEGER     NOT NULL,
  pruned_before  TIMESTAMPTZ NOT NULL,
  pruned_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log_anchor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_log_anchor FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_log_anchor TO service_role;

-- The verifier, anchor-aware. Identical to 20260807_audit_chain.sql §6 except where it starts:
-- a full scan starts from the newest anchor instead of genesis, and a ranged scan whose
-- predecessor was pruned starts from the anchor below it.
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
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'fn_verify_audit_chain: p_from (%) is greater than p_to (%)', p_from, p_to
      USING ERRCODE = '22023';
  END IF;

  IF p_from IS NOT NULL THEN
    SELECT a.row_hash, a.seq INTO v_expected, v_last_seq
      FROM audit_log a WHERE a.seq < p_from ORDER BY a.seq DESC LIMIT 1;
    IF NOT FOUND THEN
      SELECT x.row_hash, x.seq INTO v_expected, v_last_seq
        FROM audit_log_anchor x WHERE x.seq < p_from ORDER BY x.seq DESC LIMIT 1;
    END IF;
  ELSE
    -- No anchor: genesis (prev NULL, seq 0), exactly as before — so an UNANCHORED head
    -- deletion is still prev_mismatch + sequence_gap (A-2).
    SELECT x.row_hash, x.seq INTO v_expected, v_last_seq
      FROM audit_log_anchor x ORDER BY x.seq DESC LIMIT 1;
    IF NOT FOUND THEN
      v_expected := NULL;
      v_last_seq := 0;
    END IF;
  END IF;

  FOR r IN
    SELECT * FROM audit_log a
    WHERE (p_from IS NULL OR a.seq >= p_from)
      AND (p_to   IS NULL OR a.seq <= p_to)
    ORDER BY a.seq
  LOOP
    IF r.row_hash IS NULL THEN
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

    v_expected := v_actual;
    v_last_seq := r.seq;
  END LOOP;

  RETURN;
END
$verify$;
-- CREATE OR REPLACE keeps the existing ACL; restated so this file stands alone.
REVOKE EXECUTE ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_log_prune(p_months INTEGER DEFAULT 12)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cut  TIMESTAMPTZ;
  v_seq  BIGINT;
  v_hash BYTEA;
  v_n    INTEGER;
BEGIN
  -- The owner's floor. A shorter retention needs a new decision, not an argument.
  IF p_months IS NULL OR p_months < 12 THEN
    RAISE EXCEPTION 'audit_log_prune: retention must be at least 12 months (got %)', p_months
      USING ERRCODE = '22023';
  END IF;
  v_cut := now() - make_interval(months => p_months);

  -- The chain writer's lock: no audit insert interleaves with a prune.
  PERFORM pg_advisory_xact_lock(477100701);

  SELECT max(a.seq) INTO v_seq FROM audit_log a WHERE a.created_at < v_cut;
  IF v_seq IS NULL THEN
    RETURN 0;
  END IF;

  -- Never launder: the prefix must verify before its evidence is replaced by an anchor.
  IF EXISTS (SELECT 1 FROM fn_verify_audit_chain(NULL, v_seq)) THEN
    RAISE EXCEPTION 'audit_log_prune: the chain does not verify up to seq %; refusing to prune', v_seq
      USING ERRCODE = '55000';
  END IF;

  SELECT a.row_hash INTO v_hash FROM audit_log a WHERE a.seq = v_seq;
  DELETE FROM public.audit_log_client c USING audit_log a WHERE a.seq <= v_seq AND c.audit_id = a.id;
  DELETE FROM audit_log a WHERE a.seq <= v_seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.audit_log_anchor (seq, row_hash, pruned_rows, pruned_before)
  VALUES (v_seq, v_hash, v_n, v_cut);
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_log_prune(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log_prune(INTEGER) TO service_role;
