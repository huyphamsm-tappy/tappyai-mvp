-- Rollback for 20261011_p8_payments.sql. Drops only what it added.
-- ⚠ EXPORT FIRST: payment_orders, payment_events and entitlement_ledger are payment
--   records (who paid what, when). Dropping them loses that history for good.
-- Entitlements survive: `subscriptions` rows stay; rows written by SePay keep their
-- plan and expiry and are relabelled source = 'manual' so the old CHECK holds.
BEGIN;
DROP FUNCTION IF EXISTS public.p8_payments_apply_sepay(bigint, text, bigint, text, jsonb);
DROP FUNCTION IF EXISTS public.p8_payments_create_order(uuid, text, bigint, int, int, int);
DROP FUNCTION IF EXISTS public.p8_apply_entitlement(uuid, text, text, text, text, timestamptz, bigint, timestamptz, boolean, uuid, text);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payment_orders') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.payment_orders;
  END IF;
END $$;
DROP TABLE IF EXISTS public.payment_events;
DROP TABLE IF EXISTS public.payment_orders;
DROP TABLE IF EXISTS public.entitlement_ledger;
DROP FUNCTION IF EXISTS public.p8_entitlement_ledger_immutable();

UPDATE public.subscriptions SET source = 'manual' WHERE source = 'web_sepay';
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_source_check
  CHECK (source IS NULL OR source IN ('web', 'apple_iap', 'google_play', 'manual'));
COMMIT;
