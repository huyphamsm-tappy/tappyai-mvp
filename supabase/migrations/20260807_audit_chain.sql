-- ============================================================================
-- Controller V2 — Component 7: tamper-evident audit chain
--
-- Makes tampering with `audit_log` EVIDENT. It does not make it impossible —
-- prevention is a credential/grant problem (the deferred service_role
-- hardening). See docs/controller-v2/07_COMPONENT7_AUDIT_CHAIN_DESIGN.md.
--
-- Additive and idempotent. The application does not change: `writeAuditLog`
-- keeps its exact signature and all six call sites are untouched, because the
-- chain is computed by a trigger rather than by the client.
--
-- IMPLEMENTATION PRECONDITIONS (Phase E). Every one of these is load-bearing;
-- breaking any of them produces a chain that still builds but verifies wrong,
-- which the verifier then reports as tampering.
--
--   P1  Transaction isolation MUST be READ COMMITTED. Asserted below.
--   P2  Advisory lock is TRANSACTION-scoped, one fixed key, taken BEFORE any
--       chain read.
--   P3  `seq` has NO column default — allocated inside the lock, so lock order,
--       sequence order and chain order coincide by construction.
--   P4  The trigger function is VOLATILE, declared explicitly. A STABLE
--       function would use the CALLING query's snapshot and be blind to the
--       previous lock holder's committed row.
--   P5  The head lookup is written INLINE here, never delegated to a
--       LANGUAGE sql helper, which the planner may inline onto the wrong
--       snapshot.
--   P6  Read the transaction-local memo FIRST, the table second.
--   P7  NO `EXCEPTION WHEN` handler in the trigger — it would open an implicit
--       subtransaction and the memo could revert while the handler proceeds.
--   P8  No function may name `audit.chain_head` in a SET clause.
--   P9  The memo encodes the hash symmetrically (hex), never an implicit
--       bytea->text cast.
--   P10 The hash input is LENGTH-PREFIXED, so no field boundary can be shifted.
--   P11 jsonb::text determinism — asserted by test.
--   P12 Inserts are single-row, or the memo covers the batch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sequence — deliberately NOT a column default (P3)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS audit_log_seq AS BIGINT START 1;

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS seq       BIGINT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash BYTEA;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS row_hash  BYTEA;

-- ---------------------------------------------------------------------------
-- 2. Canonical hash input
--
-- Length-prefixing (P10) rather than a separator. Without it,
-- (action='a', target_id='bc') and (action='ab', target_id='c') concatenate
-- identically and a boundary can be shifted without changing the hash.
--
-- NULL and '' MUST differ: a NULL target is not an empty target.
--   NULL -> length -1, no payload
--   ''   -> length  0, no payload
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_part(p_value TEXT)
RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN int4send(-1)
    ELSE int4send(length(p_value)) || convert_to(p_value, 'UTF8')
  END
$$;

-- Timestamps are rendered in a FIXED representation. `timestamptz::text`
-- depends on the TimeZone and DateStyle GUCs, so the same instant would hash
-- differently between sessions — a determinism bug that only appears once a
-- client connects with different settings.
CREATE OR REPLACE FUNCTION fn_audit_ts(p_ts TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
$$;

-- The single definition of a row's hash. The trigger and the verifier both call
-- it, so they cannot drift apart — if they had separate copies, a change to one
-- would report the whole table as tampered.
--
-- A-1 (adversarial review): `id` was missing from this list, so
-- `UPDATE audit_log SET id = ...` was undetectable — while the design claimed
-- "every column is covered". Reproduced, then fixed. The primary key is the
-- handle every external reference and every checkpoint would use, so an
-- unhashed id is a hole in exactly the identifier the chain is meant to anchor.
DROP FUNCTION IF EXISTS fn_audit_row_hash(
  BYTEA, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, INET, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION fn_audit_row_hash(
  p_prev         BYTEA,
  p_seq          BIGINT,
  p_id           UUID,
  p_actor_id     UUID,
  p_actor_email  TEXT,
  p_actor_role   TEXT,
  p_action       TEXT,
  p_target_type  TEXT,
  p_target_id    TEXT,
  p_before_state JSONB,
  p_after_state  JSONB,
  p_metadata     JSONB,
  p_ip_address   INET,
  p_user_agent   TEXT,
  p_created_at   TIMESTAMPTZ
)
RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT sha256(
       COALESCE(p_prev, int4send(-1))
    || fn_audit_part(p_seq::TEXT)
    || fn_audit_part(p_id::TEXT)
    || fn_audit_part(p_actor_id::TEXT)
    || fn_audit_part(p_actor_email)
    || fn_audit_part(p_actor_role)
    || fn_audit_part(p_action)
    || fn_audit_part(p_target_type)
    || fn_audit_part(p_target_id)
    || fn_audit_part(p_before_state::TEXT)
    || fn_audit_part(p_after_state::TEXT)
    || fn_audit_part(p_metadata::TEXT)
    || fn_audit_part(p_ip_address::TEXT)
    || fn_audit_part(p_user_agent)
    || fn_audit_part(fn_audit_ts(p_created_at))
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill existing rows, in physical order
--
-- The chain proves integrity FROM HERE FORWARD, not retroactively — nothing
-- recorded these rows' contents before now. Resumable: only rows still missing
-- a seq are touched, so re-running is a no-op.
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  r        RECORD;
  v_prev   BYTEA;
  v_seq    BIGINT;
BEGIN
  SELECT row_hash INTO v_prev FROM audit_log WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1;

  FOR r IN SELECT * FROM audit_log WHERE seq IS NULL ORDER BY created_at, id LOOP
    v_seq := nextval('audit_log_seq');
    UPDATE audit_log SET
      seq       = v_seq,
      prev_hash = v_prev,
      row_hash  = fn_audit_row_hash(
                    v_prev, v_seq, r.id, r.actor_id, r.actor_email, r.actor_role, r.action,
                    r.target_type, r.target_id, r.before_state, r.after_state,
                    r.metadata, r.ip_address, r.user_agent, r.created_at)
      WHERE id = r.id;
    SELECT row_hash INTO v_prev FROM audit_log WHERE id = r.id;
  END LOOP;
END
$backfill$;

-- ---------------------------------------------------------------------------
-- 4. Constraints — only after the backfill, so an existing table can adopt them
-- ---------------------------------------------------------------------------
DO $constraints$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_seq_key') THEN
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_seq_key UNIQUE (seq);
  END IF;
END $constraints$;

ALTER TABLE audit_log ALTER COLUMN seq      SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN row_hash SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. The chain trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_log_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE                                  -- P4: explicit, so a future edit shows in the diff
SECURITY DEFINER
SET search_path = public, pg_temp
AS $chain$
DECLARE
  v_prev BYTEA;
  v_memo TEXT;
BEGIN
  -- P1. Under REPEATABLE READ or SERIALIZABLE the snapshot is pinned at
  -- transaction start, so a second writer cannot see the first writer's
  -- committed row and two HONEST writes fork the chain. Fail loudly instead.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION
      'audit_log chain requires READ COMMITTED (got %). See Component 7 precondition P1.',
      current_setting('transaction_isolation')
      USING ERRCODE = '25001';
  END IF;

  -- P2. Transaction-scoped: held through COMMIT, so the critical section
  -- includes the insert; released on commit, rollback AND backend crash.
  PERFORM pg_advisory_xact_lock(477100701);

  -- P3. Allocated INSIDE the lock. A column default would be evaluated when the
  -- tuple is formed — before this trigger fires — and two concurrent inserts
  -- could then chain in the opposite order to their sequence numbers.
  NEW.seq := nextval('audit_log_seq');

  -- P6/P9. Memo first: rows inserted by the CURRENT command are invisible to
  -- that command's snapshot, so a multi-row INSERT would otherwise chain every
  -- row to the same predecessor. Hex both ways — an implicit bytea->text cast
  -- yields the \x... form, which does not round-trip through decode().
  v_memo := current_setting('audit.chain_head', true);
  IF v_memo IS NOT NULL AND v_memo <> '' THEN
    v_prev := decode(v_memo, 'hex');
  ELSE
    -- P5. Inline, never a LANGUAGE sql helper: the planner may inline such a
    -- helper into the calling query and it would adopt the wrong snapshot.
    SELECT a.row_hash INTO v_prev FROM audit_log a ORDER BY a.seq DESC LIMIT 1;
  END IF;

  NEW.prev_hash := v_prev;
  NEW.row_hash  := fn_audit_row_hash(
      v_prev, NEW.seq, NEW.id, NEW.actor_id, NEW.actor_email, NEW.actor_role, NEW.action,
      NEW.target_type, NEW.target_id, NEW.before_state, NEW.after_state,
      NEW.metadata, NEW.ip_address, NEW.user_agent, NEW.created_at);

  PERFORM set_config('audit.chain_head', encode(NEW.row_hash, 'hex'), true);

  RETURN NEW;
  -- P7. No EXCEPTION handler: it would open an implicit subtransaction, and the
  -- memo could revert while the handler proceeded.
END
$chain$;

DROP TRIGGER IF EXISTS trg_audit_log_chain ON audit_log;
-- Name matters: PostgreSQL fires BEFORE ROW triggers in NAME order. A trigger
-- sorting before this one could modify NEW after we hashed it.
CREATE TRIGGER trg_audit_log_chain
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log_chain();

-- ---------------------------------------------------------------------------
-- 6. Verifier
--
-- Walks the chain in `seq` order and recomputes each hash. It chains on the
-- RECOMPUTED hash, not the stored one, so a modification propagates to its
-- successor instead of stopping at the row that was edited.
--
-- Empty result = the range verifies.
--
-- A sequence GAP alone is NOT reported. A rolled-back transaction burns a
-- sequence number, and the chain remains intact across that gap because the
-- next writer chained to what it actually saw. A gap is only evidence when it
-- comes WITH a broken link — that is what distinguishes a rollback from a
-- deletion, and it is why the verifier carries information at all.
-- ---------------------------------------------------------------------------
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
  v_started  BOOLEAN := FALSE;
BEGIN
  -- Ranged verification starts from the predecessor's stored hash, so the
  -- Controller can check a recent window without walking a million rows.
  -- A-2 (adversarial review): a full scan previously left v_started FALSE, so
  -- the FIRST row's prev_hash was never compared and the leading gap was never
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
    v_started := TRUE;
  ELSE
    v_expected := NULL;
    v_last_seq := 0;
    v_started  := TRUE;
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
      v_started := TRUE;
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

    IF v_started AND (r.prev_hash IS DISTINCT FROM v_expected) THEN
      seq := r.seq; id := r.id; problem := 'prev_mismatch'; RETURN NEXT;
      IF v_last_seq IS NOT NULL AND r.seq - v_last_seq > 1 THEN
        seq := v_last_seq + 1; id := NULL; problem := 'sequence_gap'; RETURN NEXT;
      END IF;
    END IF;

    -- Chain on the RECOMPUTED hash so an edit propagates to the successor.
    v_expected := v_actual;
    v_last_seq := r.seq;
    v_started  := TRUE;
  END LOOP;

  RETURN;
END
$verify$;

GRANT EXECUTE ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) TO service_role;
