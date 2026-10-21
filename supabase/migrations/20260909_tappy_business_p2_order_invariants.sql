-- ============================================================================
-- Tappy Business — P2.1: order-creation invariants
--
-- Contract: docs/tappy-business/PHASE_0_ARCHITECTURE.md (frozen)
-- Follows:  20260908_tappy_business_p0.sql
--
-- Purely ADDITIVE. No column is dropped, no constraint is relaxed, no data is
-- moved. Four schema invariants and one function.
--
-- ── WHY A FUNCTION AT ALL ───────────────────────────────────────────────────
--
-- An order is three rows — the order, its item, and the PENDING history entry —
-- and they are meaningless apart. Supabase's REST interface has no transaction
-- spanning statements, so writing them from the application means a crash
-- between calls can leave an order with no item: wrong totals, no product, and
-- nothing that could ever repair it because the customer is already gone.
--
-- `fn_business_create_order` exists to make those three rows one write. That is
-- the only reason. It contains no policy, no pricing and no decisions — every
-- authoritative value is computed by the application from the database's own
-- product row and passed in. The function is a transaction boundary, not a
-- business layer.
--
-- ── THE INVARIANTS THIS FILE ADDS ───────────────────────────────────────────
--
--   1. An order item cannot be added to an order that has reached a terminal
--      state. Grants already forbid UPDATE and DELETE on items; INSERT was the
--      remaining way to change what a merchant had already accepted.
--   2. `total_amount` and `total_items` must equal the sums over the items.
--      Checked at COMMIT, so an order with zero items fails too.
--   3. `expires_at` must be after `created_at`.
--   4. MVP is single-currency: VND.
--
-- Idempotent DDL — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Simple CHECK constraints
--
-- `ADD CONSTRAINT` has no IF NOT EXISTS before PostgreSQL 17.5's grammar for
-- tables, so each is guarded by a catalogue lookup. The existing
-- `currency ~ '^[A-Z]{3}$'` from P0 is left in place and narrowed by a second
-- constraint rather than being dropped and recreated — additive, and it keeps
-- the P0 migration exactly as it was reviewed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_orders_expires_after_created') THEN
    ALTER TABLE business_orders
      ADD CONSTRAINT business_orders_expires_after_created
      CHECK (expires_at > created_at);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_products_currency_vnd') THEN
    ALTER TABLE business_products
      ADD CONSTRAINT business_products_currency_vnd CHECK (currency = 'VND');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_orders_currency_vnd') THEN
    ALTER TABLE business_orders
      ADD CONSTRAINT business_orders_currency_vnd CHECK (currency = 'VND');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_order_items_currency_vnd') THEN
    ALTER TABLE business_order_items
      ADD CONSTRAINT business_order_items_currency_vnd CHECK (currency = 'VND');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. An item may only join an order that is still PENDING
--
-- P0's grants withhold UPDATE and DELETE on `business_order_items`, which makes
-- an existing item immutable. INSERT was left open, so a bug could still append
-- to an order a merchant had already accepted — changing what they agreed to,
-- after they agreed to it, and desynchronising the totals.
--
-- Trigger functions cannot be called directly ("trigger functions can only be
-- called as triggers"), so this needs no REVOKE and ADR-019's G1 exempts it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_order_items_only_pending()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM business_orders WHERE id = NEW.order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'order % does not exist', NEW.order_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'PENDING' THEN
    RAISE EXCEPTION 'cannot add an item to an order in state %', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_order_items_only_pending ON business_order_items;
CREATE TRIGGER trg_business_order_items_only_pending
  BEFORE INSERT ON business_order_items
  FOR EACH ROW EXECUTE FUNCTION business_order_items_only_pending();

-- ---------------------------------------------------------------------------
-- 3. The totals must equal the items
--
-- 🔑 DEFERRED ON PURPOSE. The order row is written before its items exist, so
-- an immediate check would fail every legitimate creation. Deferring to COMMIT
-- means the rule is evaluated once, when the transaction is complete — which is
-- also the only moment at which "an order with no items" is detectable.
--
-- `total_amount` is the number a customer reads. It is the one value in this
-- schema that must never drift from what was actually ordered.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_orders_totals_match_items()
RETURNS TRIGGER AS $$
DECLARE
  v_amount BIGINT;
  v_items  INTEGER;
BEGIN
  SELECT COALESCE(SUM(line_total_amount), 0), COALESCE(SUM(quantity), 0)
    INTO v_amount, v_items
    FROM business_order_items WHERE order_id = NEW.id;

  IF v_items = 0 THEN
    RAISE EXCEPTION 'order % has no items', NEW.public_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.total_amount <> v_amount OR NEW.total_items <> v_items THEN
    RAISE EXCEPTION
      'order % totals disagree with its items (amount %/%, items %/%)',
      NEW.public_id, NEW.total_amount, v_amount, NEW.total_items, v_items
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_orders_totals_match_items ON business_orders;
CREATE CONSTRAINT TRIGGER trg_business_orders_totals_match_items
  AFTER INSERT OR UPDATE OF total_amount, total_items ON business_orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION business_orders_totals_match_items();

-- ---------------------------------------------------------------------------
-- 4. fn_business_create_order — the transaction boundary
--
-- Writes the order, its single item and the opening history row as one unit.
-- MVP creates exactly one item; the signature takes one, and the schema already
-- supports many (P0 §15) so adding a second is a change here, not a migration.
--
-- 🔑 EVERY AUTHORITATIVE VALUE IS COMPUTED, NOT ACCEPTED.
--
-- `line_total`, `total_amount` and `total_items` are derived inside this
-- function from the unit price and quantity the caller resolved FROM THE
-- PRODUCT ROW. Nothing a client sent reaches them. The caller passes
-- `p_merchant_id` resolved from the product, never from the request — and the
-- composite foreign keys on `business_order_items` would reject a mismatch
-- regardless, which is what makes that a structural guarantee rather than a
-- convention.
--
-- SECURITY DEFINER because the tables grant to `service_role` alone; the
-- function must therefore be closed to `anon` and `authenticated` explicitly
-- (ADR-019 G1/G2), which section 5 does.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_business_create_order(
  p_order_public_id           TEXT,
  p_merchant_id               UUID,
  p_tracking_token_hash       BYTEA,
  p_customer_name             TEXT,
  p_customer_phone            TEXT,
  p_customer_address          TEXT,
  p_customer_note             TEXT,
  p_source                    TEXT,
  p_source_content_public_id  TEXT,
  p_expires_at                TIMESTAMPTZ,
  p_product_id                UUID,
  p_product_public_id         TEXT,
  p_product_name_snapshot     TEXT,
  p_unit_price_amount         BIGINT,
  p_quantity                  INTEGER,
  p_selected_options_snapshot JSONB
)
RETURNS TABLE (
  order_public_id TEXT,
  status          TEXT,
  total_amount    BIGINT,
  total_items     INTEGER,
  created_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id   UUID;
  v_line_total BIGINT;
BEGIN
  -- Integer arithmetic. VND has exponent 0, so this is đồng × quantity and
  -- nothing needs scaling. The CHECK on business_order_items asserts the same
  -- product a second time.
  v_line_total := p_unit_price_amount * p_quantity;

  INSERT INTO business_orders (
    public_id, merchant_id, tracking_token_hash, status,
    customer_name, customer_phone, customer_address, customer_note,
    total_amount, total_items, currency,
    source, source_content_public_id, expires_at
  ) VALUES (
    p_order_public_id, p_merchant_id, p_tracking_token_hash, 'PENDING',
    p_customer_name, p_customer_phone, p_customer_address, p_customer_note,
    v_line_total, p_quantity, 'VND',
    p_source, p_source_content_public_id, p_expires_at
  )
  RETURNING id INTO v_order_id;

  INSERT INTO business_order_items (
    order_id, product_id, merchant_id, product_public_id,
    product_name_snapshot, unit_price_amount, currency, quantity,
    selected_options_snapshot, line_total_amount
  ) VALUES (
    v_order_id, p_product_id, p_merchant_id, p_product_public_id,
    p_product_name_snapshot, p_unit_price_amount, 'VND', p_quantity,
    COALESCE(p_selected_options_snapshot, '[]'::jsonb), v_line_total
  );

  -- The opening transition. `from_status` is NULL because creation has no
  -- predecessor, which is exactly what P0's shape CHECK requires.
  INSERT INTO business_order_status_history (
    order_id, from_status, to_status, actor_type, actor_id, reason
  ) VALUES (
    v_order_id, NULL, 'PENDING', 'CUSTOMER', NULL, 'CREATED'
  );

  RETURN QUERY
    SELECT o.public_id, o.status, o.total_amount, o.total_items, o.created_at, o.expires_at
      FROM business_orders o WHERE o.id = v_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants (ADR-019)
--
-- On Supabase a new function is born with an EXPLICIT grant to `anon` and
-- `authenticated` from ALTER DEFAULT PRIVILEGES, so `REVOKE ... FROM PUBLIC`
-- alone would close nothing. Both roles are named. Only `service_role` — the
-- app tier — may call it.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_business_create_order(
  TEXT, UUID, BYTEA, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ,
  UUID, TEXT, TEXT, BIGINT, INTEGER, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION fn_business_create_order(
  TEXT, UUID, BYTEA, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ,
  UUID, TEXT, TEXT, BIGINT, INTEGER, JSONB
) TO service_role;

COMMENT ON FUNCTION fn_business_create_order IS
  'Writes an order, its item and its opening history row in one transaction. A transaction boundary, not a business layer: every authoritative value is computed by the caller from the product row.';

-- ---------------------------------------------------------------------------
-- 6. fn_business_expire_orders — PENDING → REJECTED after 72 hours
--
-- P0 §19/§20: a PENDING order must not live forever. A merchant who never
-- answers leaves the customer reading "shop đang xử lý" indefinitely, so the
-- system closes it and the customer-facing state stays one of the three.
--
-- 🔑 THE TRANSITION IS CONDITIONAL, NOT A READ FOLLOWED BY A WRITE.
--
-- `WHERE status = 'PENDING'` is part of the UPDATE, so a merchant accepting at
-- hour 71:59 and this job running at the same moment cannot both succeed —
-- whichever reaches the row second matches nothing. A SELECT-then-UPDATE here
-- would let an accepted order be rejected out from under the merchant.
--
-- The history row is written in the same statement set, so an expired order
-- always carries the record of who expired it. Idempotent: a second run finds
-- no PENDING rows past their expiry and changes nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_business_expire_orders(p_limit INTEGER DEFAULT 500)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH due AS (
    SELECT id FROM business_orders
     WHERE status = 'PENDING' AND expires_at <= now()
     ORDER BY expires_at
     LIMIT GREATEST(p_limit, 0)
     FOR UPDATE SKIP LOCKED
  ),
  expired AS (
    UPDATE business_orders o
       SET status = 'REJECTED', updated_at = now()
      FROM due
     WHERE o.id = due.id AND o.status = 'PENDING'
    RETURNING o.id
  ),
  logged AS (
    INSERT INTO business_order_status_history (order_id, from_status, to_status, actor_type, reason)
    SELECT id, 'PENDING', 'REJECTED', 'SYSTEM', 'EXPIRED' FROM expired
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_count FROM logged;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_business_expire_orders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_business_expire_orders(INTEGER) TO service_role;

COMMENT ON FUNCTION fn_business_expire_orders IS
  'Closes PENDING orders past expires_at as REJECTED by SYSTEM. Conditional UPDATE, so it cannot race a merchant acceptance. Idempotent.';
