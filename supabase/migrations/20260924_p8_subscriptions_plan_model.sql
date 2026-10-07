-- PHASE 8 / Task 12 — the subscription model: plan, status, period, source.
--
-- Owner decision D4: EXTEND the existing `subscriptions` table (one row per
-- user, UNIQUE(user_id) — the ON CONFLICT target of the Stripe webhook and the
-- Apple IAP verify route). Additive only: every existing writer keeps working
-- without a code change.
--
--   period_start  when the current paid period began (NULL on legacy rows)
--   source        web | apple_iap | google_play | manual
--   granted_by    the staff user who granted a `manual` plan
--   grant_note    why (free text, staff-only)
--
-- `source` is filled by a trigger when a writer does not set it, so the
-- release writers (which do not know the column) never have to. Writing an
-- unknown column through PostgREST is a PGRST204 and 500s the Stripe webhook —
-- that failure mode is documented in webhooks/stripe/route.ts and is exactly
-- why the writers are NOT changed here.
--
-- `plan` gains a CHECK for the Phase 8 plan ids + legacy 'pro', added NOT
-- VALID: it binds every new write without re-validating historical rows.
--
-- No payment gateway is integrated. Entitlement = status 'active' AND
-- current_period_end > now() (lib/plans/entitlement.ts).
--
-- Rollback: rollback/20260924_p8_subscriptions_plan_model_rollback.sql

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS period_start timestamptz,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grant_note text;

-- Backfill: Apple rows are keyed `apple_<originalTransactionId>` by the verify route.
UPDATE public.subscriptions
   SET source = CASE
     WHEN stripe_sub_id LIKE 'apple\_%' THEN 'apple_iap'
     WHEN stripe_sub_id IS NOT NULL OR stripe_customer_id IS NOT NULL THEN 'web'
     ELSE 'manual'
   END
 WHERE source IS NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_source_check
  CHECK (source IS NULL OR source IN ('web', 'apple_iap', 'google_play', 'manual'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IS NULL OR plan IN ('pro', 'pip', 'momo', 'coco', 'milo', 'sunny')) NOT VALID;

CREATE OR REPLACE FUNCTION public.p8_subscriptions_fill_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source IS NULL THEN
    NEW.source := CASE
      WHEN NEW.stripe_sub_id LIKE 'apple\_%' THEN 'apple_iap'
      WHEN NEW.stripe_sub_id IS NOT NULL OR NEW.stripe_customer_id IS NOT NULL THEN 'web'
      ELSE NULL
    END;
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.p8_subscriptions_fill_source() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS p8_subscriptions_fill_source ON public.subscriptions;
CREATE TRIGGER p8_subscriptions_fill_source
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.p8_subscriptions_fill_source();

COMMIT;
