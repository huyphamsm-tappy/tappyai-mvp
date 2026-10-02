-- Rollback of 20260929130000_commerce_click_attributions.sql.
-- 🚨 Drops the click joins: conversions not yet reconciled can no longer be tied to a person.
-- Take a backup of the table first if any row may still be needed.
DROP FUNCTION IF EXISTS public.commerce_click_attributions_sweep();
DROP TABLE IF EXISTS public.commerce_click_attributions;
