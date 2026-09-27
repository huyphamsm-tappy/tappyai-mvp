# TappyAI affiliate status: providers, links, attribution

**Source of truth for affiliate state. Last verified live: 27 Sep 2026.**
Campaign states were read in the ACCESSTRADE publisher portal (pub2.accesstrade.vn) on 27 Sep 2026: a campaign page showing **"Create link"** is approved, one showing **"Pending"** is not. Every link marked *live-tested* was built by Tappy's own resolver and followed hop by hop to the merchant page.

No secrets are in this file. Campaign ids and the publisher id are public: they appear in every tracked link.

## 1. How a click becomes attributable

```
chat tool result (hotel / product / route row)
  → src/lib/ai/tools/commerce.ts   attachCommerceLinks(…, { actorHash })
  → src/lib/ccp  resolveCommerce → resolveDeepLink
       direct merchant URL (adapter grammar, host allow-list)
       → effectiveTracking(entry)      runtime row in commerce_providers (60 s cache) → code registry default
       → wrapWithAccesstrade           https://go.isclix.com/deep_link/<publisherId>/<campaignId>?url=<enc>&utm_source=tappyai&utm_medium=ccp&sub1=<actorHash>
       → param echo                    decode url= and prove the destination is unchanged, else DIRECT
  → CommerceLink on the row → Action → web card button
user taps
  → POST /api/commerce/handoff {linkId, requestId, platform}   internal click event (commerce_handoff)
  → GA4 affiliate_click {domain, provider, tracked}             client, GA-only (no duplicate user_events row)
  → go.isclix.com (302) → go.isclix.com/deep_link/v2/… (302)
  → click.accesstrade.vn/adv.php?sub1=…&utm_source=tappyai…    ACCESSTRADE records the click here
  → merchant page carrying the merchant's own affiliate id
     (aff_sid / allianceid+SID / laz_trackid / aid / Partnerize clickref)
```

- **Joining a click to its provider and campaign.** `commerce_handoff.linkId` is the same id as `commerce_deep_link_resolved.linkId`, which carries `providerId`, `trackingPresent` and `trackingNetwork`. The campaign is the provider's row in `commerce_providers`. The handoff beacon body is deliberately unchanged because the web, Android and iOS clients share one pinned contract (`crossPlatformCommerceContract.test.ts`).
- **What `sub1` is.** A keyed hash: `HMAC-SHA256(CCP_ATTRIBUTION_SECRET, "ccp-sub1:" + verified identity id)`, truncated to 24 hex characters (`src/lib/ccp/tracking/attribution.ts`). The identity is the Supabase user id, for accounts and anonymous sessions alike. The value is never an e-mail, name, phone number or raw id. If `CCP_ATTRIBUTION_SECRET` is unset, no `sub1` is sent: the click is still tracked, it just can't be tied back to a Tappy identity.
- **Link format, verified 27 Sep 2026.** The portal's own Deep Link tool emits `https://go.isclix.com/deep_link/6277265300509373567/<campaignId>?url=<enc>&utm_source=…&sub4=oneatweb`. That is the format Tappy builds; `sub4=oneatweb` is the portal's own tool marker, and Tappy doesn't send it.
- **When a link is never wrapped:**
  - `ACCESSTRADE_PUBLISHER_ID` unset
  - campaign not approved
  - `commerce_providers.deeplink_enabled = false` or `active = false`
  - the code registry marks `deep_link` unsafe for that merchant (TikTok Shop)
  - param echo fails

  In every case the user gets the direct merchant link. A tracked URL is never fabricated.

## 2. Provider matrix (27 Sep 2026)

| Provider | Network | Campaign id | Portal state (27 Sep) | Tappy tier / deeplink | Live-tested end to end | Notes |
|---|---|---|---|---|---|---|
| Trip.com | ACCESSTRADE → Rakuten | 6455552313033835511 | Approved | Tier 1 | ✅ hotel detail with dates → `allianceid`, `SID` | Product Link tool banned (D4) |
| CellphoneS | ACCESSTRADE | 6259155740535091857 | Approved | Tier 1 (passthrough) | ✅ product page → `aff_sid` | SVIP-code orders earn no commission (campaign rule) |
| Klook | ACCESSTRADE | 4704521809526929067 | Approved | Tier 1 | ✅ activity page → `aid` (browser; scripted clients get 403) | |
| Lazada | ACCESSTRADE | 5087153089503673507 | **Approved** (was UNKNOWN) | Tier 1 | ✅ catalogue → `laz_trackid`, `sub_aff_id` | |
| Vexere | ACCESSTRADE | 5222734619328835827 | **Approved** (was UNKNOWN) | Tier 1 | ✅ dated route → `aid`, `aff_sid` | SEM on brand names banned |
| Traveloka | ACCESSTRADE → Partnerize | 6654251588167732819 | Approved | Tier 1 (campaign row added 27 Sep) | ✅ hotel landing + dated fare list → `clickref` (browser) | Only bookings from VN-located accounts earn |
| Vietnam Airlines | ACCESSTRADE | 6318680441596031865 | Approved | Tier 1 (campaign row added 27 Sep) | ✅ book-tickets page → `aff_sid` | Only `www.vietnamairlines.com` links are credited |
| TikTok Shop | ACCESSTRADE | 6648523843406889655 | Approved | **Tier 2 (direct)** | n/a | The campaign credits ONLY links made in the TikTok Shop product-feed tool (`/tool/product-feeds`, v2 API). A Deep Link earns nothing, so the code refuses it. |
| Shopee | ACCESSTRADE Smartlink | 4751584435713464237 | **Pending** | Tier 2 (direct) | n/a | |
| Điện Máy Xanh | ACCESSTRADE | 5751981382510607935 | **Pending** | Inactive (owner, 20 Sep) | n/a | |
| FPT Shop | ACCESSTRADE | 6345454361061452947 | Pending | not a provider | n/a | out of scope (owner) |
| VinWonders | ACCESSTRADE | 6258612159538991400 | Approved (Deep Link → `aff_sid` verified) | not a provider | n/a | Provider list frozen by the owner (14 Sep: 17 merchants; 20 Sep list). VinWonders is reached through Klook activity pages, which earn on the Klook campaign. |
| Tiki | ACCESSTRADE | 4348614231480407268 | Approved | **removed** (`REMOVED_MERCHANT_HOSTS`) | n/a | Owner removed it from scope; not re-enabled |
| Agoda | direct (partners.agoda.com) | — | Pending (13 Sep) | Tier 2 | n/a | see §5 |
| Booking.com | CJ | — | not applied | Tier 2 | n/a | see §5 |
| Vietjet, CGV, Ticketbox, GrabFood, ShopeeFood | — | — | no programme | Tier 2 | n/a | direct handoff only |

State lives in `commerce_providers` (runtime; the owner flips it without a deploy). The 27 Sep values are in `supabase/migrations/20260927100000_commerce_providers_portal_state.sql`.

## 3. Environment

| Variable | Where | Status 27 Sep | Effect when missing |
|---|---|---|---|
| `ACCESSTRADE_PUBLISHER_ID` = `6277265300509373567` | Vercel Production + Preview | **set 27 Sep** (takes effect on the next deployment) | every link is direct |
| `CCP_ATTRIBUTION_SECRET` (random, ≥32 chars, different per environment) | Vercel Production + Preview, local `.env.local` | **owner to set** | links are tracked but carry no `sub1` |
| `ACCESSTRADE_API_KEY` + `ACCESSTRADE_FEED_ENDPOINT` | Vercel | not set (owner) | feed ingest reports `blocked_no_credentials`; TikTok Shop product-feed links impossible |

## 4. Operational steps

1. **Apply the row state** (per database: audit `zdaprdfgpbpnxyofagmc`, then prod `fwznnobrdctuskgrvuik`). Open Supabase Dashboard → SQL Editor, paste `supabase/migrations/20260927100000_commerce_providers_portal_state.sql` and run it. Verify with the query at the end of that file. Expect 7 Tier 1 rows: cellphones, klook, lazada, traveloka, tripcom, vexere, vietnamairlines.
2. **Set `CCP_ATTRIBUTION_SECRET`** in Vercel (Production and Preview, different values), and in the local `.env.local` for UAT.
3. **Redeploy.** Env vars and code apply only to new deployments.
4. **Re-check the portal** before flipping any row. A campaign becomes Tier 1 only when its page shows "Create link", its rules don't restrict which link tool is credited, and a Deep Link followed end to end lands with the merchant's affiliate parameter.
5. **Reconcile conversions.** ACCESSTRADE reports carry `sub1`. Recompute `commerceActorHash(userId)` server-side to match. Not automated yet: there is no commission-reporting integration.

## 5. Other networks

- **Agoda (direct).** Partner Center approval was pending on 13 Sep and needs manual domain verification of `https://tappyai.com`. Support ticket 00764268. Not re-checked on 27 Sep.
- **CJ / Booking.com.** A CJ publisher account exists and the W-8BEN was filed 17 Sep. Activation isn't confirmed, and activating is what submits the queued Booking.com APAC application. Not re-checked on 27 Sep.
