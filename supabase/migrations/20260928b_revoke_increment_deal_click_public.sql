-- ---------------------------------------------------------------------------
-- security-audit L1 · only the server bumps a deal's click counter
--
-- DEPLOY ORDER: ship the code first (POST /api/deals/[id]/click calls this RPC with the service
-- role). Applied before that, the route's call fails — silently, the route swallows it — and clicks
-- simply stop being counted until the code lands. Nothing user-facing breaks either way.
--
-- GATE: applied to production ONLY under explicit Owner authorization.
--
-- WHY. 20260724_partner_deals_hardening.sql granted EXECUTE on increment_deal_click to anon and
-- authenticated, so anyone could inflate a partner deal's popularity by calling
-- /rest/v1/rpc/increment_deal_click in a loop, bypassing the route (which now rate-limits and counts
-- one click per deal per IP per day). Functions are also EXECUTE-able by PUBLIC by default, so PUBLIC
-- is revoked explicitly.
--
-- Idempotent. Rollback: rollback/20260928b_revoke_increment_deal_click_public_rollback.sql
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.increment_deal_click(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_deal_click(uuid) TO service_role;
