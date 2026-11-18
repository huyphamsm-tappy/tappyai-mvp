-- Rollback of 20261203_payments_no_refund.sql: restores the 20261016 p8_payments_apply_sepay (surplus ignored, a paid order answers `already_settled`,
-- a second Pip is kept as `mismatch` for a staff refund). The column payment_orders.bonus_seconds stays (harmless, default 0).
BEGIN;
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
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_events WHERE provider = 'sepay' AND event_id = p_tx_id::text) THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END IF;

  IF p_transfer_type IS DISTINCT FROM 'in' THEN
    v_result := 'ignored_out';
  ELSIF p_code IS NULL THEN
    v_result := 'no_order';
  ELSE
    SELECT user_id INTO v_payer FROM public.payment_orders WHERE code = upper(p_code);
    IF v_payer IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('p8_payment_order:' || v_payer::text, 0));
    END IF;
    SELECT * INTO v_order FROM public.payment_orders WHERE code = upper(p_code) FOR UPDATE;
    IF NOT FOUND THEN
      v_result := 'no_order';
    ELSIF v_order.status = 'paid' THEN
      v_result := 'already_settled';
    ELSIF v_order.user_id IS NULL THEN
      v_result := 'no_order';
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

  IF v_result IN ('paid', 'late_paid') THEN
    UPDATE public.payment_orders
       SET status = 'paid', paid_at = now(), sepay_tx_id = p_tx_id, received_vnd = v_total
     WHERE id = v_order.id;
    v_grant := public.p8_apply_entitlement(
      v_order.user_id, v_order.plan, 'web_sepay', 'sepay:' || p_tx_id::text, 'stack',
      now(), v_order.duration_days::bigint * 86400, NULL, NULL, NULL, 'order ' || v_order.code);
  ELSIF v_result IN ('mismatch', 'pip_used') THEN
    UPDATE public.payment_orders
       SET status = 'mismatch', sepay_tx_id = p_tx_id, received_vnd = v_total
     WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'result', v_result,
    'order_id', v_order.id, 'user_id', v_order.user_id, 'plan', v_order.plan, 'code', v_order.code,
    'amount_vnd', v_order.amount_vnd, 'received_vnd', COALESCE(v_total, p_amount),
    'expires_at', v_grant -> 'after_end');
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_payments_apply_sepay(bigint, text, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p8_payments_apply_sepay(bigint, text, bigint, text, jsonb) TO service_role;
COMMIT;
