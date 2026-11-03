-- ============================================================================
-- Tappy Business — P3: merchant order transitions
--
-- Contract: docs/tappy-business/PHASE_0_ARCHITECTURE.md (frozen) §6
-- Follows:  20260909_tappy_business_p2_order_invariants.sql
--
-- ONE function. No new table, no new column, no new state, no relaxed
-- constraint. The reject reason uses `business_order_status_history.reason`,
-- which P0 already provides — nothing customer-visible is added.
--
-- ── WHY A FUNCTION, AGAIN ───────────────────────────────────────────────────
--
-- A transition is two writes that must be one: the status change and the
-- history row that records it. Split across two REST calls, a crash between
-- them leaves an ACCEPTED order whose trail says it is still PENDING — a
-- contradiction no later run can resolve, because nothing can tell whether the
-- accept happened or a history row was lost.
--
-- ── 🔑 WHY `FOR UPDATE`, AND NOT JUST A CONDITIONAL UPDATE ──────────────────
--
-- A conditional `UPDATE ... WHERE status = 'PENDING'` is already safe against
-- lost updates. It is NOT enough here, because the decision has to be *read*
-- before it can be reported: the caller must be told whether it transitioned or
-- found a terminal state, and reading the status separately from updating it is
-- exactly the race the requirement forbids.
--
-- `SELECT ... FOR UPDATE` takes the row lock first, so two concurrent accepts —
-- or an accept racing a reject — serialise on the row. The second one to arrive
-- reads the terminal state the first one wrote and reports it. Both mechanisms
-- are kept: the lock decides the order, the `WHERE status = 'PENDING'` on the
-- UPDATE means a bug in the lock cannot become a double transition.
--
-- The expiry job (P2.1) takes the same rows with `FOR UPDATE SKIP LOCKED`, so a
-- merchant holding the lock is skipped rather than blocked, and a merchant
-- arriving after expiry reads REJECTED and reports it.
--
-- ── RETURN SHAPE ────────────────────────────────────────────────────────────
--
--   zero rows           this merchant has no such order — 404, and it is the
--                       SAME answer another merchant's order gives, because the
--                       merchant scope is part of the lookup below
--   transitioned=false  the order is already terminal — 409, with the state
--   transitioned=true   the transition happened
--
-- Idempotent DDL — safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_business_transition_order(
  p_merchant_id     UUID,
  p_order_public_id TEXT,
  p_to_status       TEXT,
  p_actor_id        TEXT,
  p_reason          TEXT
)
RETURNS TABLE (
  transitioned BOOLEAN,
  status       TEXT,
  updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_status TEXT;
  v_at     TIMESTAMPTZ;
BEGIN
  -- The only two transitions a merchant may make (P0 §6). Anything else is a
  -- caller bug, not a business outcome, so it raises rather than returning a
  -- polite false.
  IF p_to_status NOT IN ('ACCEPTED', 'REJECTED') THEN
    RAISE EXCEPTION 'illegal target status %', p_to_status USING ERRCODE = 'check_violation';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'a transition must carry a reason' USING ERRCODE = 'check_violation';
  END IF;

  -- 🔑 THE MERCHANT SCOPE IS PART OF THE LOOKUP, not a check afterwards.
  -- Another merchant's order matches nothing here, so it is indistinguishable
  -- from an order that does not exist.
  SELECT o.id, o.status, o.updated_at
    INTO v_id, v_status, v_at
    FROM business_orders o
   WHERE o.public_id = p_order_public_id
     AND o.merchant_id = p_merchant_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_status <> 'PENDING' THEN
    -- Already terminal. No write, and deliberately no history row: a failed
    -- transition must not leave a trail suggesting something happened.
    RETURN QUERY SELECT false, v_status, v_at;
    RETURN;
  END IF;

  -- Every column reference is table-qualified. `status` and `updated_at` are
  -- also the names of this function's OUT parameters, and in PL/pgSQL an OUT
  -- parameter is a variable: a bare `status` in the WHERE clause is ambiguous
  -- and PostgreSQL refuses it rather than guessing. Qualifying is the fix that
  -- keeps the return shape readable to callers.
  UPDATE business_orders
     SET status = p_to_status, updated_at = now()
   WHERE business_orders.id = v_id
     AND business_orders.status = 'PENDING'
  RETURNING business_orders.updated_at INTO v_at;

  INSERT INTO business_order_status_history (
    order_id, from_status, to_status, actor_type, actor_id, reason
  ) VALUES (
    v_id, 'PENDING', p_to_status, 'MERCHANT', p_actor_id, p_reason
  );

  RETURN QUERY SELECT true, p_to_status, v_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants (ADR-019)
--
-- SECURITY DEFINER because the Business tables grant to `service_role` alone.
-- On Supabase a new function carries an EXPLICIT grant to `anon` and
-- `authenticated` from ALTER DEFAULT PRIVILEGES, so both are named — a REVOKE
-- FROM PUBLIC alone would close nothing.
--
-- 🚨 The function takes `p_merchant_id` as an argument, so EXECUTE by an
-- untrusted role would be a way to transition ANY merchant's order. Only the
-- app tier, which derives that id from the Controller session, may call it.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_business_transition_order(UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION fn_business_transition_order(UUID, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION fn_business_transition_order IS
  'PENDING -> ACCEPTED|REJECTED for one merchant''s own order. Row-locked and conditional, so concurrent transitions serialise and exactly one wins. Writes the status change and its history row in one transaction. Merchant scope is part of the lookup.';
