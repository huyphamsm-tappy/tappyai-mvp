-- Rollback for 20260924_p8_subscriptions_plan_model.sql. Drops only what it added.
-- ⚠ Manual grants lose their provenance (source/granted_by/grant_note/period_start);
--   the rows themselves — and therefore every entitlement — survive.
BEGIN;
DROP TRIGGER IF EXISTS p8_subscriptions_fill_source ON public.subscriptions;
DROP FUNCTION IF EXISTS public.p8_subscriptions_fill_source();
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS grant_note,
  DROP COLUMN IF EXISTS granted_by,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS period_start;
COMMIT;
