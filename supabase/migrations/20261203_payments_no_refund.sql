-- Payments: NEVER a refund (owner decision 18/11/2026). FILE ONLY until the owner applies it (UAT first; production only with the owner's go-ahead).
-- Builds on 20261011_p8_payments, 20261015_p8_subscriptions and 20261016_p7_pip_one_time (needs all three).
--
-- Before this file, three situations left the company holding a customer's money it had to give back by hand:
--   * a transfer ABOVE the price granted the plan and silently swallowed the surplus;
--   * a SECOND transfer on an order that was already paid was `already_settled` (money received, nothing granted);
--   * a Pip payment for an account that already used its one-time Pip (two Pip orders opened in parallel) was kept as `mismatch` "for a staff refund".
-- (A transfer SHORT of the price already accumulated on the order as `mismatch` until topped up: unchanged here, only the screen now says what is missing.)
--
-- Now every dong that reaches a known order code is attributed, in the same transaction, with no manual step:
--   * SHORT            -> `mismatch` (unchanged): the money stays on the order (received_vnd adds up); a later transfer with the same code completes it.
--   * EXACT            -> `paid` / `late_paid` (unchanged).
--   * ABOVE the price  -> `paid` / `late_paid` AND the surplus becomes extra time at the SAME rate as the plan (surplus * duration / price, floored to the
--                         second), stored in payment_orders.bonus_seconds and added to the grant. The payer is told how many extra days they got.
--   * ANY transfer on an already paid order -> `extra_paid`: the whole amount becomes extra time at the plan's rate.
--   * A second Pip      -> `pip_used`: the one-time rule still forbids a second Pip PURCHASE, but money that already arrived becomes extra time at the Pip rate
--                         (ledger mode extend_to, which the web-Pip unique index does not cover); the order is closed as `paid`.
--   Extra time never changes the plan the account is on: it extends the current end (or, with no live plan, starts the order's plan).
-- The only money that cannot be attached to an account is a transfer that carries no valid order code (`no_order`): a bank-note problem, not a calculation
-- problem; the QR pre-fills the note and the amount.
--
-- Additive: one column with a default; the function keeps its name, signature, grants, per-payer lock and the results it already returned (plus `extra_paid`).
-- Rollback: rollback/20261203_payments_no_refund_rollback.sql (restores the 20261016 function; the column stays, it is harmless).

BEGIN;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS bonus_seconds bigint NOT NULL DEFAULT 0 CHECK (bonus_seconds >= 0);

CREATE OR REPLACE FUNCTION public.p8_payments_apply_sepay(
  p_tx_id bigint, p_code text, p_amount bigint, p_transfer_type text, p_summary jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_result text;
  v_event_id bigint;
  v_grant jsonb;
  v_total bigint;
  v_payer uuid;
  v_base_seconds bigint;
  v_bonus bigint := 0;
  v_active_end timestamptz;
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_events WHERE provider = 'sepay' AND event_id = p_tx_id::text) THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END IF;

  IF p_transfer_type IS DISTINCT FROM 'in' THEN
    v_result := 'ignored_out';
  ELSIF p_code IS NULL THEN
    v_result := 'no_order';
  ELSE
    -- Same per-payer lock create_order takes, and taken BEFORE the order row so the two never wait on each other.
    SELECT user_id INTO v_payer FROM public.payment_orders WHERE code = upper(p_code);
    IF v_payer IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('p8_payment_order:' || v_payer::text, 0));
    END IF;
    SELECT * INTO v_order FROM public.payment_orders WHERE code = upper(p_code) FOR UPDATE;
    IF NOT FOUND THEN
      v_result := 'no_order';
    ELSIF v_order.user_id IS NULL THEN
      v_result := 'no_order';
    ELSIF v_order.status = 'paid' THEN
      v_result := 'extra_paid';
      v_total := COALESCE(v_order.received_vnd, 0) + p_amount;
    ELSE
      v_total := COALESCE(CASE WHEN v_order.status = 'mismatch' THEN v_order.received_vnd END, 0) + p_amount;
      IF v_total >= v_order.amount_vnd AND v_order.plan = 'pip' AND public.p7_pip_used(v_order.user_id) THEN
        v_result := 'pip_used';
      ELSIF v_total >= v_order.amount_vnd THEN
        v_result := CASE WHEN v_order.expires_at < now() THEN 'late_paid' ELSE 'paid' END;
      ELSE
        v_result := 'mismatch';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.payment_events (provider, event_id, event_type, result, user_id, order_id, amount_vnd, summary)
  VALUES ('sepay', p_tx_id::text, p_transfer_type, v_result, v_order.user_id, v_order.id, p_amount, COALESCE(p_summary, '{}'::jsonb))
  ON CONFLICT (provider, event_id) DO NOTHING
  RETURNING id INTO v_event_id;
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END IF;

  v_base_seconds := v_order.duration_days::bigint * 86400;

  IF v_result IN ('paid', 'late_paid') THEN
    v_bonus := floor((v_total - v_order.amount_vnd)::numeric * v_base_seconds / v_order.amount_vnd)::bigint;
    UPDATE public.payment_orders
       SET status = 'paid', paid_at = now(), sepay_tx_id = p_tx_id, received_vnd = v_total, bonus_seconds = v_bonus
     WHERE id = v_order.id;
    v_grant := public.p8_apply_entitlement(
      v_order.user_id, v_order.plan, 'web_sepay', 'sepay:' || p_tx_id::text, 'stack',
      now(), v_base_seconds + v_bonus, NULL, NULL, NULL, 'order ' || v_order.code);
  ELSIF v_result IN ('extra_paid', 'pip_used') THEN
    -- Money that arrived after the order was settled (or for a second Pip): all of it becomes time at the order's rate, on top of the CURRENT end.
    -- extend_to (not stack) so the one-Pip-per-account unique index cannot refuse it, and the plan the account is on is never swapped.
    v_bonus := floor((CASE WHEN v_result = 'pip_used' THEN v_total ELSE p_amount END)::numeric * v_base_seconds / v_order.amount_vnd)::bigint;
    SELECT current_period_end INTO v_active_end FROM public.subscriptions
     WHERE user_id = v_order.user_id AND status = 'active' AND current_period_end > now();
    UPDATE public.payment_orders
       SET status = 'paid', paid_at = COALESCE(paid_at, now()), sepay_tx_id = COALESCE(sepay_tx_id, p_tx_id),
           received_vnd = v_total, bonus_seconds = bonus_seconds + v_bonus
     WHERE id = v_order.id;
    v_grant := public.p8_apply_entitlement(
      v_order.user_id, CASE WHEN v_active_end IS NULL THEN v_order.plan END, 'web_sepay', 'sepay:' || p_tx_id::text, 'extend_to',
      NULL, v_bonus, COALESCE(v_active_end, now()) + make_interval(secs => v_bonus), NULL, NULL, 'order ' || v_order.code || ' extra');
  ELSIF v_result = 'mismatch' THEN
    UPDATE public.payment_orders
       SET status = 'mismatch', sepay_tx_id = p_tx_id, received_vnd = v_total
     WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'result', v_result,
    'order_id', v_order.id, 'user_id', v_order.user_id, 'plan', v_order.plan, 'code', v_order.code,
    'amount_vnd', v_order.amount_vnd, 'received_vnd', p_amount, 'total_received_vnd', COALESCE(v_total, p_amount),
    'short_vnd', GREATEST(COALESCE(v_order.amount_vnd, 0) - COALESCE(v_total, p_amount), 0),
    'bonus_seconds', v_bonus,
    'expires_at', v_grant -> 'after_end');
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_payments_apply_sepay(bigint, text, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p8_payments_apply_sepay(bigint, text, bigint, text, jsonb) TO service_role;

COMMIT;
