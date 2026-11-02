-- Plan ids of the Tappy (Promax) plans (owner 01/11/2026). NOT APPLIED - the owner applies it with the release script.
--
-- The owner's plans: Pip (Free), MoMo (Trial), Coco (Pro), Tappy (Promax). The stored ids of the plans already sold stay
-- (pip = MoMo trial, momo / coco = Coco 1 / 3 months; milo / sunny are no longer sold, their rows stay valid). This adds the two
-- new ids, promax1m (Tappy 1 month) and promax3m (Tappy 3 months), to every place that lists the allowed plan ids:
--   * subscriptions.plan, entitlement_ledger.plan, payment_orders.plan CHECK constraints;
--   * p8_apply_entitlement (THE entitlement writer): copied from 20261015_p8_subscriptions.sql unchanged except its plan list.
-- Nothing else changes: no row is touched, no grant changes (the function keeps service_role only).
-- Must be applied BEFORE the web release that sells the Tappy plans (an order or a store purchase for promax1m / promax3m is
-- refused by the database until then). Rollback: rollback/20261102_plans_promax_rollback.sql.

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IS NULL OR plan IN ('pro', 'pip', 'momo', 'coco', 'milo', 'sunny', 'promax1m', 'promax3m')) NOT VALID;

ALTER TABLE public.entitlement_ledger DROP CONSTRAINT IF EXISTS entitlement_ledger_plan_check;
ALTER TABLE public.entitlement_ledger
  ADD CONSTRAINT entitlement_ledger_plan_check
  CHECK (plan IS NULL OR plan IN ('pip', 'momo', 'coco', 'milo', 'sunny', 'promax1m', 'promax3m'));

ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_plan_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_plan_check
  CHECK (plan IN ('pip', 'momo', 'coco', 'milo', 'sunny', 'promax1m', 'promax3m'));

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
  v_keep_source boolean;
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
  IF p_plan IS NOT NULL AND p_plan NOT IN ('pip', 'momo', 'coco', 'milo', 'sunny', 'promax1m', 'promax3m') THEN
    RAISE EXCEPTION 'p8_apply_entitlement: unknown plan %', p_plan USING ERRCODE = '22023';
  END IF;
  IF p_source = 'manual' AND length(btrim(COALESCE(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'p8_apply_entitlement: a manual change needs a reason' USING ERRCODE = '22023';
  END IF;

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
  -- A manual grant rides on top of a live row without taking it over.
  v_keep_source := p_mode = 'revoke_store'
    OR (p_source = 'manual' AND v_active_end IS NOT NULL AND v_sub.source IS DISTINCT FROM 'manual');

  IF p_mode = 'stack' THEN
    IF p_plan IS NULL OR p_seconds IS NULL OR p_seconds <= 0 THEN
      RAISE EXCEPTION 'p8_apply_entitlement: stack needs plan and seconds > 0' USING ERRCODE = '22023';
    END IF;
    p_base_at := COALESCE(p_base_at, v_now);
    v_after := greatest(COALESCE(v_active_end, p_base_at), p_base_at) + make_interval(secs => p_seconds);
    v_status := 'active';
    v_plan := CASE WHEN v_keep_source THEN COALESCE(v_plan, p_plan) ELSE p_plan END;
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
    -- P8-8: p_base_at = when the store event HAPPENED. An EXPIRATION/refund that happened before
    -- the newest store purchase/extension we applied (a late retry of an old event) must not take
    -- away the newer period. Recorded, changes nothing. Callers without an event time: as before.
    IF p_base_at IS NOT NULL AND p_base_at < (
         SELECT max(created_at) FROM public.entitlement_ledger
          WHERE user_id = p_user AND source = p_source AND mode IN ('stack', 'extend_to')) THEN
      v_remaining := interval '0';
    END IF;
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
    PERFORM set_config('p8.entitlement_writer', 'on', true);
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
        source = CASE WHEN v_keep_source THEN public.subscriptions.source ELSE EXCLUDED.source END,
        cancel_at_period_end = CASE WHEN v_keep_source THEN public.subscriptions.cancel_at_period_end
                                    ELSE EXCLUDED.cancel_at_period_end END,
        granted_by = CASE WHEN p_source = 'manual' THEN EXCLUDED.granted_by ELSE public.subscriptions.granted_by END,
        grant_note = CASE WHEN p_source = 'manual' THEN EXCLUDED.grant_note ELSE public.subscriptions.grant_note END,
        updated_at = v_now;
    END IF;
    PERFORM set_config('p8.entitlement_writer', '', true);
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
