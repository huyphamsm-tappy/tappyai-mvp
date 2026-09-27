-- 2026-09-27 — COMMERCE PROVIDERS: the ACCESSTRADE portal state, re-verified live.
--
-- Every value below was read from pub2.accesstrade.vn on 27 Sep 2026 (campaign page: "Create link" =
-- approved, "Pending" = pending) and every enabled deeplink was followed end to end through
-- go.isclix.com → click.accesstrade.vn → the merchant page with the merchant's affiliate parameter
-- attached (docs/commerce/AFFILIATE_STATUS.md). Rows only change here — no schema change, no row
-- added or removed; idempotent (a second run rewrites the same values).
--
--   · Lazada, Vexere     — APPROVED (the 20 Sep seed enabled them "per owner"; now portal-verified).
--   · Traveloka          — APPROVED; campaign id put on file (it was the missing half of Tier 1).
--   · Vietnam Airlines   — APPROVED; campaign id put on file. Campaign rule: only
--                          www.vietnamairlines.com links are credited (the only host CCP emits).
--   · TikTok Shop        — APPROVED, but the campaign credits ONLY links made in the TikTok Shop
--                          product-feed tool; a generic Deep Link earns nothing. Deeplink OFF (direct)
--                          until a product-feed link integration exists. The code registry also marks
--                          deep_link unsafe for it, so this row cannot be flipped back by mistake.
--   · Shopee, DMX        — still PENDING in the portal: no deeplink (DMX stays inactive, owner 20 Sep).

update public.commerce_providers
   set deeplink_enabled = true, tier = 1, network = 'accesstrade', campaign_id = '5087153089503673507',
       note = 'Tier 1 — ACCESSTRADE approved (portal 27 Sep 2026); Deep Link verified end to end'
 where provider_id = 'lazada';

update public.commerce_providers
   set deeplink_enabled = true, tier = 1, network = 'accesstrade', campaign_id = '5222734619328835827',
       note = 'Tier 1 — ACCESSTRADE approved (portal 27 Sep 2026); Deep Link verified end to end'
 where provider_id = 'vexere';

update public.commerce_providers
   set deeplink_enabled = true, tier = 1, network = 'accesstrade', campaign_id = '6654251588167732819',
       note = 'Tier 1 — ACCESSTRADE → Partnerize approved (portal 27 Sep 2026); Deep Link verified end to end'
 where provider_id = 'traveloka';

update public.commerce_providers
   set deeplink_enabled = true, tier = 1, network = 'accesstrade', campaign_id = '6318680441596031865',
       note = 'Tier 1 — ACCESSTRADE approved (portal 27 Sep 2026); only www.vietnamairlines.com links are credited'
 where provider_id = 'vietnamairlines';

update public.commerce_providers
   set deeplink_enabled = false, tier = 2, network = 'accesstrade', campaign_id = '6648523843406889655',
       note = 'Tier 2 — campaign approved but credits ONLY TikTok Shop product-feed links (portal rule 27 Sep 2026); Deep Link earns nothing'
 where provider_id = 'tiktokshop';

update public.commerce_providers
   set deeplink_enabled = false, tier = 2,
       note = 'Tier 2 — ACCESSTRADE Smartlink still PENDING (portal 27 Sep 2026): direct handoff'
 where provider_id = 'shopee';

update public.commerce_providers
   set deeplink_enabled = false, tier = 2,
       note = 'Owner decision 2026-09-20: disabled entirely. ACCESSTRADE still PENDING (portal 27 Sep 2026)'
 where provider_id = 'dmx';

-- VERIFY (expect 7 Tier 1 rows, all accesstrade with a campaign id):
--   select provider_id, active, deeplink_enabled, tier, network, campaign_id from public.commerce_providers
--    where deeplink_enabled order by provider_id;
--   → cellphones, klook, lazada, traveloka, tripcom, vexere, vietnamairlines
