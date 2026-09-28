-- Rollback for 20260928b_revoke_increment_deal_click_public.sql.
-- Restores the grant from 20260724_partner_deals_hardening.sql.
-- 🚨 Reopens security-audit L1: anyone can inflate deal click counts through PostgREST again.
GRANT EXECUTE ON FUNCTION public.increment_deal_click(uuid) TO anon, authenticated;
