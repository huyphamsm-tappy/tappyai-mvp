-- PHASE 8 / SUBSCRIPTIONS — Pip · Momo · Coco · Milo · Sunny (docs/payments/PLAN.md).
--
-- Written by the SECURITY session (branch p8/subscriptions) — review independently before merge.
--
-- Class A (additive + function replacements). Nothing here changes behaviour for a row the
-- Phase 8 ledger never touched; the app reads none of it while SUBSCRIPTIONS_ENABLED is OFF.
--
--   p8_apply_entitlement            REPLACED: manual grants need a reason and never re-label a paid
--                                   row as 'manual' (P8-7); sets the writer marker (P8-8)
--   p8_revoke_manual_grant          NEW: ends ONE manual grant by removing only its unused time (P8-7)
--   p8_subscriptions_ledger_guard   NEW trigger: a writer other than the ledger functions cannot
--                                   change plan/status/end/source of a live ledger-managed row (P8-8)
--   p8_payments_apply_sepay         REPLACED: a short transfer no longer locks an order; transfers to
--                                   one order add up until the price is reached (P8-17)
--   p8_subscriptions_expire         NEW: active → expired once the period has ended (cron, not registered)
--   p8_anonymize_payment_records    NEW: on account deletion the payment records STAY (accounting)
--                                   but lose every link to the person (Huy's decision 2026-10-01)
--
-- Web plans are ONE-TIME payments per period (Huy 2026-10-01): no auto-renew, no reminder; an ended
-- plan is EXPIRED and the user buys again. Only the stores auto-renew.
--
-- Rollback: rollback/20261015_p8_subscriptions_rollback.sql

BEGIN;

-- ── Defence in depth: only the server writes subscriptions ──────────────────
-- The prod snapshot grants every privilege to anon/authenticated and relies on RLS having no
-- write policy. TRUNCATE is not subject to RLS at all.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.subscriptions FROM anon, authenticated;

-- ── ledger modes += revoke_manual, expire ───────────────────────────────────
ALTER TABLE public.entitlement_ledger DROP CONSTRAINT IF EXISTS entitlement_ledger_mode_check;
ALTER TABLE public.entitlement_ledger
  ADD CONSTRAINT entitlement_ledger_mode_check
  CHECK (mode IN ('stack', 'extend_to', 'revoke_store', 'mark', 'revoke_manual'));

-- ── P8-8: the ledger guard ──────────────────────────────────────────────────
-- The ledger functions set `p8.entitlement_writer` for their own transaction. Any other writer
-- (the release Stripe webhook, Apple notifications, a stray admin upsert) updating a row that the
-- ledger manages and that is still paid keeps the entitlement columns as they were. It does not
-- raise: a failing Stripe webhook is retried for days.
CREATE OR REPLACE FUNCTION public.p8_subscriptions_ledger_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('p8.entitlement_writer', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'active' AND OLD.current_period_end > now()
     AND EXISTS (SELECT 1 FROM public.entitlement_ledger l WHERE l.user_id = OLD.user_id) THEN
    NEW.plan := OLD.plan;
    NEW.status := OLD.status;
    NEW.current_period_end := OLD.current_period_end;
    NEW.period_start := OLD.period_start;
    NEW.source := OLD.source;
    NEW.cancel_at_period_end := OLD.cancel_at_period_end;
    RAISE WARNING 'p8_subscriptions_ledger_guard: kept ledger-managed entitlement for %', OLD.user_id;
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_subscriptions_ledger_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS p8_subscriptions_ledger_guard ON public.subscriptions;
CREATE TRIGGER p8_subscriptions_ledger_guard
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.p8_subscriptions_ledger_guard();

-- ── THE entitlement writer (replaces 20261011) ──────────────────────────────
-- Same contract as before, plus:
--   * p_source = 'manual' needs a reason (p_note, ≥ 3 characters) — P8-7;
--   * a manual grant on top of a live paid row keeps that row's `source` and auto-renew flag,
--     so a later "end the manual grant" can never be mistaken for ending the paid period — P8-7;
--   * marks its own transaction as the ledger writer for the guard trigger — P8-8;
--   * revoke_store whose event (p_base_at) happened before the newest applied store purchase
--     changes nothing — a late old webhook cannot override a newer state — P8-8.
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
  IF p_plan IS NOT NULL AND p_plan NOT IN ('pip', 'momo', 'coco', 'milo', 'sunny') THEN
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

-- ── P8-7: end ONE manual grant ──────────────────────────────────────────────
-- Time is used first-in-first-out along the stacked timeline: the grant occupied
-- [after_end − seconds, after_end] when it was written; what is still ahead of `now` in that window
-- is its unused part, and only that is removed. Time bought before or after the grant keeps its
-- full length. Idempotent: `revoke:<grant ref>`.
-- Results: not_found | duplicate | applied
CREATE OR REPLACE FUNCTION public.p8_revoke_manual_grant(
  p_user uuid, p_grant_ref text, p_actor uuid, p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_grant public.entitlement_ledger%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_active_end timestamptz;
  v_grant_start timestamptz;
  v_unused interval := interval '0';
  v_after timestamptz;
  v_status text;
  v_ref text := 'revoke:' || p_grant_ref;
BEGIN
  IF p_user IS NULL OR p_grant_ref IS NULL OR length(btrim(COALESCE(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'p8_revoke_manual_grant: user, grant and a reason are required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p8_entitlement:' || p_user::text, 0));

  SELECT * INTO v_grant FROM public.entitlement_ledger
   WHERE external_ref = p_grant_ref AND user_id = p_user AND source = 'manual' AND mode = 'stack';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.entitlement_ledger WHERE external_ref = v_ref) THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_user FOR UPDATE;
  v_active_end := CASE WHEN FOUND AND v_sub.status = 'active' AND v_sub.current_period_end > v_now
                       THEN v_sub.current_period_end END;
  v_grant_start := v_grant.after_end - make_interval(secs => v_grant.seconds);
  v_unused := greatest(v_grant.after_end - greatest(v_now, v_grant_start), interval '0');
  v_after := v_sub.current_period_end;
  v_status := v_sub.status;
  IF v_active_end IS NOT NULL AND v_unused > interval '0' THEN
    v_after := greatest(v_now, v_active_end - v_unused);
    v_status := CASE WHEN v_after > v_now THEN 'active' ELSE 'canceled' END;
  END IF;

  INSERT INTO public.entitlement_ledger
    (user_id, external_ref, source, mode, plan, seconds, before_end, after_end, actor_id, note)
  VALUES
    (p_user, v_ref, 'manual', 'revoke_manual', v_grant.plan, extract(epoch FROM v_unused)::bigint,
     v_sub.current_period_end, v_after, p_actor, p_note);

  IF v_active_end IS NOT NULL AND v_unused > interval '0' THEN
    PERFORM set_config('p8.entitlement_writer', 'on', true);
    UPDATE public.subscriptions
       SET current_period_end = v_after, status = v_status, updated_at = v_now
     WHERE user_id = p_user;
    PERFORM set_config('p8.entitlement_writer', '', true);
  END IF;

  RETURN jsonb_build_object('status', 'applied', 'removed_seconds', extract(epoch FROM v_unused)::bigint,
    'before_end', v_sub.current_period_end, 'after_end', v_after, 'state', v_status);
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_revoke_manual_grant(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p8_revoke_manual_grant(uuid, text, uuid, text) TO service_role;

-- ── expiry (cron; NOT registered — docs/payments/PLAN.md) ───────────────────
-- Only ledger-era sources: legacy Stripe/Apple rows keep the release behaviour.
CREATE OR REPLACE FUNCTION public.p8_subscriptions_expire()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('p8.entitlement_writer', 'on', true);
  UPDATE public.subscriptions
     SET status = 'expired', updated_at = now()
   WHERE status = 'active' AND current_period_end <= now()
     AND source IN ('web_sepay', 'google_play', 'apple_iap', 'manual');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('p8.entitlement_writer', '', true);
  RETURN v_n;
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_subscriptions_expire() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p8_subscriptions_expire() TO service_role;

-- ── account deletion: keep the records, drop the person ─────────────────────
-- Huy 2026-10-01: payment records are kept for accounting, anonymised. When an auth user is deleted:
--   entitlement_ledger  user_id → NULL, note → NULL (staff notes may name the person); actor_id → NULL
--                       where the deleted account was the STAFF member. Kept: ref (provider
--                       transaction/event id), source, mode, plan, seconds, dates.
--   payment_events      user_id → NULL. Kept: provider, provider tx id, result, amount, order id,
--                       summary (gateway, bank reference, order code, transaction date — no names).
--   payment_orders      user_id → NULL (its own FK), resolved_by → NULL. Kept: code, plan, amount,
--                       status, dates, SePay tx id.
-- How long to keep them: ⚠ to be confirmed by someone who knows accounting/tax law (docs/payments/PLAN.md).
-- The ledger stays append-only: only THIS cascade (inside a trigger, pg_trigger_depth() > 1) may null
-- exactly those columns; any hand-written UPDATE is still refused.
ALTER TABLE public.entitlement_ledger ALTER COLUMN user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.p8_entitlement_ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1
     AND current_setting('p8.ledger_anonymize', true) = 'on'
     AND NEW.id = OLD.id AND NEW.external_ref = OLD.external_ref AND NEW.source = OLD.source
     AND NEW.mode = OLD.mode AND NEW.plan IS NOT DISTINCT FROM OLD.plan
     AND NEW.seconds IS NOT DISTINCT FROM OLD.seconds
     AND NEW.store_expires_at IS NOT DISTINCT FROM OLD.store_expires_at
     AND NEW.before_end IS NOT DISTINCT FROM OLD.before_end AND NEW.after_end IS NOT DISTINCT FROM OLD.after_end
     AND NEW.created_at = OLD.created_at
     AND (NEW.user_id IS NOT DISTINCT FROM OLD.user_id OR NEW.user_id IS NULL)
     AND (NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id OR NEW.actor_id IS NULL)
     AND (NEW.note IS NOT DISTINCT FROM OLD.note OR NEW.note IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'entitlement_ledger is append-only (%)', TG_OP USING ERRCODE = '42501';
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_entitlement_ledger_immutable() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.p8_anonymize_payment_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('p8.ledger_anonymize', 'on', true);
  UPDATE public.entitlement_ledger SET user_id = NULL, note = NULL WHERE user_id = OLD.id;
  UPDATE public.entitlement_ledger SET actor_id = NULL WHERE actor_id = OLD.id;
  PERFORM set_config('p8.ledger_anonymize', '', true);
  UPDATE public.payment_events SET user_id = NULL WHERE user_id = OLD.id;
  UPDATE public.payment_orders SET resolved_by = NULL WHERE resolved_by = OLD.id;
  RETURN OLD;
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_anonymize_payment_records() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS p8_anonymize_payment_records ON auth.users;
CREATE TRIGGER p8_anonymize_payment_records
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.p8_anonymize_payment_records();

-- ── P8-17: SePay decision (replaces 20261011) ───────────────────────────────
-- Transfers to one order ADD UP. A short transfer marks the order `mismatch` (staff can see it) but
-- does not lock it: a later transfer that brings the total to the price pays it. So a stranger who
-- sends 1đ with someone else's code can no longer block that order.
-- Results: duplicate | ignored_out | no_order | paid | late_paid | mismatch | already_settled
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

COMMIT;
