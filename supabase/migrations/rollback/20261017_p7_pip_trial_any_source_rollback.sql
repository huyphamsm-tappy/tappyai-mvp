-- Rollback of 20261017_p7_pip_trial_any_source.sql: back to the 20261016 rule (staff comps do not consume the trial).
BEGIN;
CREATE OR REPLACE FUNCTION public.p7_pip_used(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.entitlement_ledger
                  WHERE user_id = p_user AND plan = 'pip' AND mode IN ('stack', 'extend_to') AND source <> 'manual')
      OR EXISTS (SELECT 1 FROM public.payment_orders
                  WHERE user_id = p_user AND plan = 'pip' AND status = 'paid')
$$;
REVOKE EXECUTE ON FUNCTION public.p7_pip_used(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.p7_pip_used(uuid) TO service_role;
DROP INDEX IF EXISTS public.entitlement_ledger_pip_once;
CREATE UNIQUE INDEX entitlement_ledger_pip_once
  ON public.entitlement_ledger (user_id)
  WHERE plan = 'pip' AND source = 'web_sepay' AND mode = 'stack';
COMMIT;
