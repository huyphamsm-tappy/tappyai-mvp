-- Rollback of 20261015_p8_subscriptions.sql (docs/payments/PLAN.md).
-- Restores the 20261011 bodies of p8_apply_entitlement and p8_payments_apply_sepay, drops what
-- 20261015 added. Keeps every entitlement and every ledger row (the ledger is append-only).
-- Deliberately NOT reverted: the REVOKE of write privileges on subscriptions from anon/authenticated
-- (RLS already refused those writes; TRUNCATE did not go through RLS).

BEGIN;

DROP TRIGGER IF EXISTS p8_subscriptions_ledger_guard ON public.subscriptions;
DROP FUNCTION IF EXISTS public.p8_subscriptions_ledger_guard();
DROP FUNCTION IF EXISTS public.p8_revoke_manual_grant(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.p8_subscriptions_expire();
DROP TRIGGER IF EXISTS p8_anonymize_payment_records ON auth.users;
DROP FUNCTION IF EXISTS public.p8_anonymize_payment_records();
-- user_id stays NULLABLE: anonymised rows (user_id NULL) may exist and the ledger cannot be edited.
CREATE OR REPLACE FUNCTION public.p8_entitlement_ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'entitlement_ledger is append-only (%)', TG_OP USING ERRCODE = '42501';
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_entitlement_ledger_immutable() FROM PUBLIC, anon, authenticated;

-- revoke_manual rows may exist and the ledger cannot be edited: re-add the old CHECK as NOT VALID.
ALTER TABLE public.entitlement_ledger DROP CONSTRAINT IF EXISTS entitlement_ledger_mode_check;
ALTER TABLE public.entitlement_ledger
  ADD CONSTRAINT entitlement_ledger_mode_check
  CHECK (mode IN ('stack', 'extend_to', 'revoke_store', 'mark')) NOT VALID;

-- ── 20261011 bodies ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.p8_apply_entitlement(
  p_user uuid,
  p_plan text,
  p_source text,
  p_external_ref text,
  p_mode text,
  p_base_at timestamptz DEFAULT NULL,
  p_seconds bigint DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_cancel boolean DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_sub public.subscriptions%ROWTYPE;
  v_has_row boolean;
  v_active_end timestamptz;
  v_before timestamptz;
  v_after timestamptz;
  v_status text;
  v_plan text;
  v_start timestamptz;
  v_last_store timestamptz;
  v_remaining interval;
  v_ledger_id bigint;
  v_write boolean := false;
BEGIN
  IF p_user IS NULL OR p_external_ref IS NULL OR length(p_external_ref) = 0 THEN
    RAISE EXCEPTION 'p8_apply_entitlement: user and external_ref are required' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('web_sepay', 'google_play', 'apple_iap', 'manual') THEN
    RAISE EXCEPTION 'p8_apply_entitlement: unknown source %', p_source USING ERRCODE = '22023';
  END IF;
  IF p_mode NOT IN ('stack', 'extend_to', 'revoke_store', 'mark') THEN
    RAISE EXCEPTION 'p8_apply_entitlement: unknown mode %', p_mode USING ERRCODE = '22023';
  END IF;
  IF p_plan IS NOT NULL AND p_plan NOT IN ('pip', 'momo', 'coco', 'milo', 'sunny') THEN
    RAISE EXCEPTION 'p8_apply_entitlement: unknown plan %', p_plan USING ERRCODE = '22023';
  END IF;

  -- One writer at a time per user: two channels granting at once must both stack.
  PERFORM pg_advisory_xact_lock(hashtextextended('p8_entitlement:' || p_user::text, 0));

  IF EXISTS (SELECT 1 FROM public.entitlement_ledger WHERE external_ref = p_external_ref) THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_user FOR UPDATE;
  v_has_row := FOUND;
  v_before := CASE WHEN v_has_row THEN v_sub.current_period_end END;
  v_active_end := CASE WHEN v_has_row AND v_sub.status = 'active' AND v_sub.current_period_end > v_now
                       THEN v_sub.current_period_end END;
  v_after := v_before;
  v_status := CASE WHEN v_has_row THEN v_sub.status END;
  v_plan := CASE WHEN v_has_row THEN v_sub.plan END;
  v_start := CASE WHEN v_has_row THEN v_sub.period_start END;

  IF p_mode = 'stack' THEN
    IF p_plan IS NULL OR p_seconds IS NULL OR p_seconds <= 0 THEN
      RAISE EXCEPTION 'p8_apply_entitlement: stack needs plan and seconds > 0' USING ERRCODE = '22023';
    END IF;
    p_base_at := COALESCE(p_base_at, v_now);
    v_after := greatest(COALESCE(v_active_end, p_base_at), p_base_at) + make_interval(secs => p_seconds);
    v_status := 'active';
    v_plan := p_plan;
    IF v_active_end IS NULL THEN v_start := p_base_at; END IF;
    v_write := true;
  ELSIF p_mode = 'extend_to' THEN
    IF p_expires_at IS NULL THEN
      RAISE EXCEPTION 'p8_apply_entitlement: extend_to needs expires_at' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at > COALESCE(v_active_end, v_now) THEN
      IF v_active_end IS NULL THEN v_start := v_now; END IF;
      v_after := p_expires_at;
      v_status := 'active';
      v_plan := COALESCE(p_plan, v_plan);
      v_write := true;
    ELSIF p_plan IS NOT NULL AND v_active_end IS NOT NULL THEN
      v_plan := p_plan;
      v_write := true;
    END IF;
  ELSIF p_mode = 'revoke_store' THEN
    SELECT max(store_expires_at) INTO v_last_store
      FROM public.entitlement_ledger
     WHERE user_id = p_user AND source = p_source AND mode IN ('stack', 'extend_to');
    v_remaining := greatest(COALESCE(v_last_store, v_now) - v_now, interval '0');
    IF v_active_end IS NOT NULL AND v_remaining > interval '0' THEN
      v_after := greatest(v_now, v_active_end - v_remaining);
      v_status := CASE WHEN v_after > v_now THEN 'active' ELSE 'expired' END;
      v_write := true;
    END IF;
  ELSE -- mark
    v_write := v_has_row AND p_cancel IS NOT NULL;
  END IF;

  INSERT INTO public.entitlement_ledger
    (user_id, external_ref, source, mode, plan, seconds, store_expires_at, before_end, after_end, actor_id, note)
  VALUES
    (p_user, p_external_ref, p_source, p_mode, p_plan, p_seconds,
     CASE WHEN p_source IN ('google_play', 'apple_iap') THEN p_expires_at END,
     v_before, v_after, p_actor, p_note)
  ON CONFLICT (external_ref) DO NOTHING
  RETURNING id INTO v_ledger_id;
  IF v_ledger_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF v_write THEN
    IF p_mode = 'mark' THEN
      UPDATE public.subscriptions SET cancel_at_period_end = p_cancel, updated_at = v_now WHERE user_id = p_user;
    ELSE
      INSERT INTO public.subscriptions
        (user_id, plan, status, period_start, current_period_end, source, cancel_at_period_end, granted_by, grant_note, updated_at)
      VALUES
        (p_user, v_plan, v_status, v_start, v_after, p_source, COALESCE(p_cancel, false),
         CASE WHEN p_source = 'manual' THEN p_actor END, CASE WHEN p_source = 'manual' THEN p_note END, v_now)
      ON CONFLICT (user_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        period_start = EXCLUDED.period_start,
        current_period_end = EXCLUDED.current_period_end,
        source = CASE WHEN p_mode = 'revoke_store' THEN public.subscriptions.source ELSE EXCLUDED.source END,
        cancel_at_period_end = CASE WHEN p_mode = 'revoke_store' THEN public.subscriptions.cancel_at_period_end
                                    ELSE EXCLUDED.cancel_at_period_end END,
        granted_by = CASE WHEN p_source = 'manual' THEN EXCLUDED.granted_by ELSE public.subscriptions.granted_by END,
        grant_note = CASE WHEN p_source = 'manual' THEN EXCLUDED.grant_note ELSE public.subscriptions.grant_note END,
        updated_at = v_now;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'applied', 'changed', v_write, 'plan', v_plan,
    'before_end', v_before, 'after_end', v_after, 'ledger_id', v_ledger_id);
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_apply_entitlement(uuid, text, text, text, text, timestamptz, bigint, timestamptz, boolean, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p8_apply_entitlement(uuid, text, text, text, text, timestamptz, bigint, timestamptz, boolean, uuid, text)
  TO service_role;

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
    ELSIF v_order.status IN ('paid', 'mismatch') THEN
      v_result := 'already_settled';
    ELSIF v_order.user_id IS NULL THEN
      v_result := 'no_order';
    ELSIF p_amount >= v_order.amount_vnd THEN
      v_result := CASE WHEN v_order.expires_at < now() THEN 'late_paid' ELSE 'paid' END;
    ELSE
      v_result := 'mismatch';
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
       SET status = 'paid', paid_at = now(), sepay_tx_id = p_tx_id, received_vnd = p_amount
     WHERE id = v_order.id;
    v_grant := public.p8_apply_entitlement(
      v_order.user_id, v_order.plan, 'web_sepay', 'sepay:' || p_tx_id::text, 'stack',
      now(), v_order.duration_days::bigint * 86400, NULL, NULL, NULL, 'order ' || v_order.code);
  ELSIF v_result = 'mismatch' THEN
    UPDATE public.payment_orders
       SET status = 'mismatch', sepay_tx_id = p_tx_id, received_vnd = p_amount
     WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'result', v_result,
    'order_id', v_order.id, 'user_id', v_order.user_id, 'plan', v_order.plan, 'code', v_order.code,
    'amount_vnd', v_order.amount_vnd, 'received_vnd', p_amount,
    'expires_at', v_grant -> 'after_end');
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_payments_apply_sepay(bigint, text, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p8_payments_apply_sepay(bigint, text, bigint, text, jsonb) TO service_role;

COMMIT;
