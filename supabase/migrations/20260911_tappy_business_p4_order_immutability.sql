-- ============================================================================
-- Tappy Business — P4: the order state machine, enforced by the database
--
-- Contract: docs/tappy-business/PHASE_0_ARCHITECTURE.md (frozen) §6
-- Follows:  20260910_tappy_business_p3_order_transitions.sql
--
-- ONE trigger. No new table, column, state, or relaxed constraint.
--
-- ── WHAT THIS CLOSES ────────────────────────────────────────────────────────
--
-- P0's CHECK constrains the VALUE of `status` — it must be one of three. It
-- says nothing about the TRANSITION, and `service_role` holds UPDATE on this
-- table because the status change, the expiry job and the PII retention job all
-- need it.
--
-- So until now the only thing stopping
--
--     UPDATE business_orders SET status = 'PENDING' WHERE status = 'ACCEPTED';
--
-- was that no code does it. That is a property of today's code, not of the
-- schema, and P4's requirement is that a terminal order cannot be mutated by
-- ANY route — including one written next year by someone who never read the
-- architecture doc.
--
-- The history table already refuses to RECORD such a move (its `from_status`
-- CHECK admits only NULL or 'PENDING'), which meant the status could drift away
-- from a trail that could not follow it. This closes the other half.
--
-- ── AND THE IMMUTABLE COLUMNS ───────────────────────────────────────────────
--
-- Seven columns are frozen after INSERT: the two identities, the token digest,
-- the three money fields, and the attribution source. Nothing legitimate ever
-- rewrites them, and each one is load-bearing — `merchant_id` is the isolation
-- boundary, `total_amount` is what the customer agreed to, `tracking_token_hash`
-- is the customer's credential.
--
-- `customer_*` are deliberately NOT frozen: the retention job nulls them in
-- place (§37), which is the one legitimate write. `created_at` and `expires_at`
-- are not frozen either — moving an expiry earlier or later is an operational
-- act available only to `service_role`, not an escalation, and freezing them
-- would leave no way to correct a clock problem.
--
-- Also closes the deferred `claimed_by_user_id` write-once finding: three
-- documents called that column write-once while nothing enforced it.
--
-- Idempotent DDL — safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION business_orders_enforce_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  -- ── The state machine ─────────────────────────────────────────────────────
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'PENDING' THEN
      RAISE EXCEPTION 'order % is % and cannot change state', OLD.public_id, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status NOT IN ('ACCEPTED', 'REJECTED') THEN
      RAISE EXCEPTION 'illegal transition % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Immutable after creation ──────────────────────────────────────────────
  IF NEW.public_id           IS DISTINCT FROM OLD.public_id
     OR NEW.merchant_id      IS DISTINCT FROM OLD.merchant_id
     OR NEW.tracking_token_hash IS DISTINCT FROM OLD.tracking_token_hash
     OR NEW.total_amount     IS DISTINCT FROM OLD.total_amount
     OR NEW.total_items      IS DISTINCT FROM OLD.total_items
     OR NEW.currency         IS DISTINCT FROM OLD.currency
     OR NEW.source           IS DISTINCT FROM OLD.source
  THEN
    RAISE EXCEPTION 'order % has immutable fields that cannot be rewritten', OLD.public_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── claimed_by_user_id is write-once ──────────────────────────────────────
  -- The claim flow is Phase 1.5 and this column is always NULL today, but three
  -- documents describe it as write-once. This makes that true rather than
  -- aspirational, before any code depends on it.
  IF OLD.claimed_by_user_id IS NOT NULL
     AND NEW.claimed_by_user_id IS DISTINCT FROM OLD.claimed_by_user_id
  THEN
    RAISE EXCEPTION 'order % is already claimed', OLD.public_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fires before `trg_business_orders_updated_at` would matter: both are BEFORE
-- UPDATE and PostgreSQL runs them in name order, so `enforce_lifecycle` (e)
-- precedes `updated_at` (u). Either order would be correct — this one just
-- means an illegal update is refused before anything is rewritten.
DROP TRIGGER IF EXISTS trg_business_orders_enforce_lifecycle ON business_orders;
CREATE TRIGGER trg_business_orders_enforce_lifecycle
  BEFORE UPDATE ON business_orders
  FOR EACH ROW EXECUTE FUNCTION business_orders_enforce_lifecycle();

COMMENT ON FUNCTION business_orders_enforce_lifecycle IS
  'PENDING -> ACCEPTED|REJECTED only; terminal orders are frozen. Also freezes the identity, token-digest and money columns, and makes claimed_by_user_id write-once. A trigger function cannot be called directly, so it needs no grant (ADR-019 G1 exempts trigger functions).';
