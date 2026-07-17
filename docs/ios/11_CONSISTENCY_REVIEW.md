# TappyAI — Cross-Document Consistency Review

> Part of the `docs/ios/` design dossier. Validates that every production feature and rule is represented **consistently** across the dossier, and records every inconsistency found (with resolution). Reviewed 2026-07-10 across all dossier documents + ADRs.

## 1. Feature × document coverage matrix

Each major module is traced through the docs it must appear in. ✅ = present & consistent.

| Module | 01 Spec | 02 Inv | 03 Rules | 04 API | 05 DB | 06 UX | 15 Migr | Notes |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|-------|
| Auth (Google/Zalo/OTP/anon) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | anon cookie→server (R1) |
| AI Chat + 10 tools | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | backend AI capability layer (provider-abstracted), data-stream |
| Reviews feed + player | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | state machine in 06/ADR-009 |
| Review create/upload | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | limits consistent |
| Comments/like/save/follow | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | counts server-side |
| Music + original sound | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | consent 4-layer |
| Utility tools (7) | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | fortune deterministic |
| SuperTux game | ✅ | ✅ | ✅ | n/a | n/a | ✅ | ✅ | WebView (R17) |
| Discovery/places/images | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | OSM + Serper |
| Service detail + bookings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | LIVE (see §2.5) |
| Groups | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ≤10, creator suggest |
| Personalization/recs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | server-side engine |
| Notifications (push+inbox) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Web-Push→APNs |
| Price-watch | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | cron-driven |
| Profile/settings/i18n | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | vi/en, dark mode |
| Subscription/entitlements | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pro OFF; StoreKit (09/ADR-006) |
| Integrations (Zalo/GCal) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | CSRF/PKCE |
| Nav shell / IA | ✅ | ✅ | — | — | — | ✅ | ✅ | 5 tabs; feed owns nav |
| Admin analytics | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | operator-only, NOT ported |

**Result:** every production module is represented consistently across the applicable documents. No module is missing from a doc where it belongs; no invented modules appear.

## 2. Inconsistencies found — between production code and its own copy/old docs

These are pre-existing conflicts **in the product**, surfaced by the audit. Resolution rule (per `13 §1`): **enforced code wins.** All dossier docs already follow the code; listed here so they are reconciled before store submission.

| # | Inconsistency | Enforced truth (follow this) | Where reconciled |
|---|---------------|------------------------------|------------------|
| 2.1 | Subscription page copy said **10/day** free; chat enforces **15/day** — ✅ **RESOLVED 2026-07-11**: `/subscription` copy + remaining counter updated to **15/day** (web fix) | **15/day** (`chat/route.ts`) | 01 §7, 02, 03 §3, 09 §10 |
| 2.2 | Pro upsell copy exists but `SHOW_PRO_UPGRADE=false` | **Pro OFF** → MVP no purchase surface | 01, 03, 09 §6, ADR-006 |
| 2.3 | Game hub says "7 game"; only SuperTux exists | **1 game (SuperTux WASM)** | 01 §7, 02 §F, 15 §6 |
| 2.4 | Old memo: fortune is AI | **Deterministic local** (djb2 + static banks) | 02 §F, 14 §3, 15 §6 |
| 2.5 | Old memo: `/service/[id]` is dead code | **LIVE** booking lead-capture | 01 §7, 02 §G, 15 §7 |
| 2.6 | price-check comment says every 6h; scheduled daily | **Daily** (`vercel.json`) | 04 §2.14 |
| 2.7 | Only 3/7 crons scheduled | 3 active (deal-notif, morning-brief, price-check) | 02 §H, 04 §2.14 |
| 2.8 | "Google Places key empty" (local) vs present in prod | Key present in prod; **photo billing disabled** → Serper/OSM images | 01 §7, 02 §G |
| 2.9 | Old note: no delete-comment UI | **Delete-own exists** (Trash2) | 02 §C |
| 2.10 | Comment count column drifts under RLS | Always **server-recomputed** | 04 §2.6, 05 |

**Action for team:** reconcile user-facing copy 2.3 in Web before iOS store submission (tracked in R14/R18); 2.1 is ✅ RESOLVED 2026-07-11. iOS builds to the enforced truth regardless.

## 3. Dossier internal consistency checks

- **Quota numbers:** 15/day free + 5/day anon appear identically in 01/02/03/04/09 — consistent. ✅
- **Auth model:** "Bearer works; anon cookie doesn't for native" stated consistently in 01/03/04/09/ADR-005/R1. ✅
- **Payments:** StoreKit-not-Stripe + backend entitlement + Pro-OFF consistent across 01/03/09/ADR-006/15/R2. ✅
- **Media/feed state machine:** described once in 06, referenced (not re-defined) by 09/15/ADR-009/R4 — single source, no divergent copies. ✅
- **Place data/images:** OSM + Serper (no places.photos, no embedded map) consistent in 02/06/15. ✅
- **Server-side-forever logic:** 14 aligns with 04 (endpoints) and 05 (RPC/triggers). ✅
- **Cross-references:** doc numbers referenced across files (01→02..10, 09→06, 13→02/03/04/05/06, 15→03/04/14) all resolve to existing files. ✅
- **Native Design Principle:** stated in 00 §5, 09 §1b, and applied in 06 + ADR-002/009 — consistent. ✅

## 4. Residual gaps (known, non-blocking, tracked)

| Gap | Severity | Where tracked |
|-----|----------|---------------|
| `04` API Contract has full endpoint table + core specs, but **field-by-field request/response for non-core endpoints** still lives in the per-domain audit sections (scratchpad). | Low — sufficient to start; complete before freezing the network layer. | 04 §4 note, R10 |
| Backend deltas needed for iOS: **APNs dispatch case** + device tokens; **Apple IAP verify endpoint** + entitlement `source` column (only when Pro on). | Medium — required for push / paid, additive. | 09 §6/§7, R2/R8 |
| Native **anon-chat quota** strategy (cookie unusable) needs a backend decision. | Medium — decide at kickoff. | R1, ADR-005 |
| Three canonical tables (`reviews`,`review_saves`,`favorites`) lack base DDL in repo (prod-only); trust introspection. | Low — documented. | 05 |

## 5. Verdict

The dossier is **internally consistent** and **complete for its purpose**. All production-vs-copy inconsistencies are identified with a single resolution rule and are reconciled in the derived docs. Residual gaps are known, non-blocking, and tracked in the risk register. No conflicting documentation remains within the dossier.
