-- P7 WEB — Pip trial is consumed by ANY mechanism that grants Pip (owner decision, FINAL).
--
-- 20261016 let a staff comp (source = manual) leave the trial unused and backstopped only web_sepay grants.
-- Now: web_sepay, google_play, apple_iap AND manual Pip grants all consume it, so
--   · p7_pip_used(user)            = a Pip ledger row of ANY source (mode stack / extend_to) or a paid Pip order
--   · entitlement_ledger_pip_once  = at most ONE Pip purchase/grant (mode 'stack') per user, whatever the source.
--     (extend_to rows are store period syncs of the SAME grant, so they stay unrestricted.)
-- A second Pip therefore cannot be bought (create_order -> pip_used), cannot be paid into a grant (apply_sepay -> pip_used)
-- and cannot be written by any other grant path (p8_apply_entitlement -> unique_violation 23505). A replay of the same
-- external_ref is still answered 'duplicate' before it reaches the index, so idempotency is unchanged.
-- Rollback: rollback/20261017_p7_pip_trial_any_source_rollback.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.p7_pip_used(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.entitlement_ledger
                  WHERE user_id = p_user AND plan = 'pip' AND mode IN ('stack', 'extend_to'))
      OR EXISTS (SELECT 1 FROM public.payment_orders
                  WHERE user_id = p_user AND plan = 'pip' AND status = 'paid')
$$;
REVOKE EXECUTE ON FUNCTION public.p7_pip_used(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p7_pip_used(uuid) TO service_role;

DROP INDEX IF EXISTS public.entitlement_ledger_pip_once;
CREATE UNIQUE INDEX entitlement_ledger_pip_once
  ON public.entitlement_ledger (user_id)
  WHERE plan = 'pip' AND mode = 'stack';

COMMIT;
