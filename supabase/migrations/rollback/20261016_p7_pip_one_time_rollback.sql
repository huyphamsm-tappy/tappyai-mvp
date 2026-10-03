-- Rollback of 20261016_p7_pip_one_time.sql: restores the 20261011 create_order and the 20261015 apply_sepay bodies.
BEGIN;
CREATE OR REPLACE FUNCTION public.p8_payments_create_order(
  p_user uuid, p_plan text, p_amount bigint, p_days int, p_ttl_seconds int DEFAULT 900, p_max_pending int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  v_order public.payment_orders%ROWTYPE;
  v_pending int;
  i int;
  attempt int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('p8_payment_order:' || p_user::text, 0));
  -- Lazily close this user's stale orders so the cap counts live ones only.
  UPDATE public.payment_orders SET status = 'expired'
   WHERE user_id = p_user AND status = 'pending' AND expires_at <= now();
  SELECT count(*) INTO v_pending FROM public.payment_orders
   WHERE user_id = p_user AND status = 'pending' AND expires_at > now();
  IF v_pending >= p_max_pending THEN
    RETURN jsonb_build_object('status', 'too_many_pending');
  END IF;
  LOOP
    attempt := attempt + 1;
    v_bytes := uuid_send(gen_random_uuid());
    v_code := 'TAPPY';
    FOR i IN 0..5 LOOP
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    END LOOP;
    BEGIN
      INSERT INTO public.payment_orders (user_id, plan, amount_vnd, duration_days, code, expires_at)
      VALUES (p_user, p_plan, p_amount, p_days, v_code, now() + make_interval(secs => p_ttl_seconds))
      RETURNING * INTO v_order;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF attempt >= 5 THEN RAISE; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('status', 'created', 'order', to_jsonb(v_order));
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_payments_create_order(uuid, text, bigint, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p8_payments_create_order(uuid, text, bigint, int, int, int) TO service_role;

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
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_events WHERE provider = 'sepay' AND event_id = p_tx_id::text) THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END IF;

  IF p_transfer_type IS DISTINCT FROM 'in' THEN
    v_result := 'ignored_out';
  ELSIF p_code IS NULL THEN
    v_result := 'no_order';
  ELSE
    SELECT * INTO v_order FROM public.payment_orders WHERE code = upper(p_code) FOR UPDATE;
    IF NOT FOUND THEN
      v_result := 'no_order';
    ELSIF v_order.status = 'paid' THEN
      v_result := 'already_settled';
    ELSIF v_order.user_id IS NULL THEN
      v_result := 'no_order';
    ELSE
      v_total := COALESCE(CASE WHEN v_order.status = 'mismatch' THEN v_order.received_vnd END, 0) + p_amount;
      IF v_total >= v_order.amount_vnd THEN
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
  ELSIF v_result = 'mismatch' THEN
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

DROP INDEX IF EXISTS public.entitlement_ledger_pip_once;
DROP FUNCTION IF EXISTS public.p7_pip_used(uuid);

COMMIT;
