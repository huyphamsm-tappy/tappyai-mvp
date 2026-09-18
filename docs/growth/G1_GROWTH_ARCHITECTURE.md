# TappyAI G1 Growth Architecture — implementation record

**Branch:** `feat/g1-growth` (worktree `.worktrees/g1-growth`, off `integration/v3-canonical` @ `7b0ee0c`)
**Status:** Implemented + tested locally. **Not production-verified, not owner-approved** (Release Gate policy).
**Date:** 2026-09-15
**Definitions version:** `G1_DEFINITIONS_VERSION = 1` (`src/lib/analytics/analytics-contract.ts`)

---

## 0. The loop, as built

```text
User asks Tappy  ─── query ───────────────► user_events (existing pipeline)
      │
Useful rich result ── result_action ──────► (outbound_booking | outbound_map | outbound_tiktok | follow_up_query | share)
      │
Share (explicit) ── preview ── confirm ───► POST /api/shared-results  → sanitize → freeze → INSERT shared_results
      │                                     share_created
      ▼
/r/<slug>  (ISR, no LLM, no session) ───► share_viewed (dedup per share/session; unique by anon_id)
      │
New visitor: reads everything, may ask ─► POST /api/chat { shareSlug }  (existing quota + per-share cap)
      │
signup (first-touch attribution) · return (D5–9) · share again
      │
/food /shopping /travel /entertainment /spa + sitemap + robots  ─► Google / AI search → geo_google / geo_chatgpt
```

## 1. Components

| Phase | Component | Files |
|---|---|---|
| G1-A | Analytics contract (7 events, 11 sources, 5 action types, definitions, gates) | `src/lib/analytics/analytics-contract.ts` |
| G1-A | One `anon_id` (localStorage authority + `tappy_aid` cookie mirror) | `src/lib/analytics/anonId.ts`, `src/lib/tracking/envelope.ts` |
| G1-A | Attribution (session + first touch; `?src=`, referrer GEO, share path, Zalo UA) | `src/lib/analytics/attribution.ts` |
| G1-A | Emitters (once-only guards, classification) | `src/lib/analytics/g1Events.ts`, `src/hooks/useG1Session.ts`, `TrackingProvider`, `authEvents.ts`, `ChatInterface.tsx` |
| G1-A | Ingestion side effects (anon→user stitch, view counters) | `src/lib/analytics/g1Ingestion.ts`, `src/app/api/track/route.ts` |
| G1-B | Frozen public payload model + validator | `src/lib/share/sharedResult.ts` |
| G1-B | Store (service-role, public projection only) | `src/lib/share/sharedResultStore.ts`, `slug.ts` |
| G1-B | Public page, JSON-LD, metadata, OG card | `src/app/r/[slug]/*`, `src/lib/share/sharedResultMetadata.ts`, `renderPublicMarkdown.ts` |
| G1-C | Privacy sanitizer (before persistence) | `src/lib/share/publicSanitizer.ts` |
| G1-C | Follow-up guard (per-share cap + public context line) | `src/lib/share/followUpGuard.ts`, `src/app/api/chat/route.ts` |
| G1-C | Share policy constants | `src/lib/config/product.ts` (`SHARE_*`, `ANON_SOFT_SIGNUP_GATE_AFTER`) |
| G1-D | Share preview dialog, API (preview/create/get/withdraw) | `src/components/share/SharePreviewDialog.tsx`, `MessageActionBar.tsx`, `src/app/api/shared-results/**`, `src/lib/share/shareRequest.ts` |
| G1-E | Zalo Mini App boundary + signed identity cap | `src/lib/zalo/*`, `src/app/api/zalo/mini/verify/route.ts`, `docs/growth/ZALO_MINI_APP.md` |
| G1-F | Android Direct Share (inbound) | `android/.../navigation/IncomingShareParser.kt`, `AppNavHostViewModel.kt`, `MainActivity.kt`, `AndroidManifest.xml` |
| G1-G | Web Share Target | `public/manifest.json`, `src/app/share-target/page.tsx`, `src/lib/growth/shareTarget.ts` |
| G1-H | QR / POS entry | `src/lib/growth/qrEntry.ts`, `src/app/api/qr/entry/route.ts` |
| G1-I | GEO: hubs, robots, sitemap | `src/app/(discovery)/[domain]/page.tsx`, `src/lib/discovery/domainHubs.ts`, `src/app/robots.ts`, `src/app/sitemap.ts` |
| G1-J | Metrics + gates + admin report | `src/lib/analytics/growthMetrics.ts`, `growthReportService.ts`, `src/app/api/admin/analytics/growth/route.ts` |
| DB | Migration + rollback + RLS/ACL test | `supabase/migrations/20260913_g1_growth_foundation.sql`, `rollback/…`, `supabase/tests/g1_growth_foundation.test.ts` |

Moved (not duplicated) so the server can read them: `parseCTA` → `src/lib/structuredContent/parseCta.ts`, `parseFollowups` → `parseFollowups.ts` (re-exported from `ChatInterface`, same precedent as `parsePlan`).

## 2. Definitions (pinned by tests)

* **Active user** — an identity with ≥1 `query` in the period.
* **Activated user** — ≥1 `result_action` in the session of the identity's first `query`.
* **D7** — cohort by **first query** VN day; retained if a `query` falls on day **5–9** after it. The window is a deliberate v1 widening for small samples. Changing it requires bumping `G1_DEFINITIONS_VERSION` and a note here.
* **Useful result** — a result with ≥1 `result_action`. No separate event.
* **TGDĐ** — `source: 'tgdd'` is reserved in the enum; nothing emits it; an install is not activation.
* **Identity** — `anon_id` or `user_id`; `anon_identity_map` stitches them so a person is counted once across signup. Historical events are never rewritten.
* **k-factor (v1)** — share-attributed *new* active identities ÷ active identities in the period.

Gates (`G1_GATES`): Gate 0 activation ≥ 50 % (fail < 30 %, n 30–50) · Gate 1 D7 ≥ 20 % (fail < 10 %, n ≥ 300) · Gate 2 k ≥ 0.2 (fail < 0.1). The report answers `insufficient_sample` below n rather than a false rate.

## 3. Privacy — what can and cannot enter a shared payload

Sanitization runs **server-side, before INSERT**, on the *persisted* assistant message (already free of Google Places content by `mayPersist`). Never on the live places annotation.

| Can enter | Cannot enter |
|---|---|
| Public title (user-editable, redacted) | user_id / anon_id / session_id / conversation_id (validator: forbidden keys, any depth) |
| Generalised question (relations, budgets, first-person locations stripped) | Emails, phone numbers, CCCD/CMND, card numbers (regex redaction → `[đã ẩn]`) |
| Answer prose, markers stripped, memory-addressed lines removed | First-person addresses ("nhà tôi ở …", "I live at …") |
| Outbound buttons: https + `tel:` only; never `/chat`, `/api`, `/profile`… | `internal_booking`, `zalo` handoffs, http links, tappyai private routes |
| ≤3 images from storable hosts | Google Places photo URLs, Vercel Blob, localhost/private IPs |
| Plan / shopping / places projections (venue address, price, links kept) | `distanceKm` (GPS-derived), memory, preferences, tokens, prompts, `decisionEvidenceId` |
| Suggested follow-up questions | Any `[TAPPY_*]`/`[CTA_BUTTONS]`/`[FOLLOWUPS]` residue (validator rejects) |

The preview dialog shows the exact sanitized payload; nothing is published without Confirm. The owner can withdraw (`status='removed'`, row kept for attribution); the payload column is not updatable even by the owner (column grant).

## 4. Security boundary

* Public: `/`, `/food|shopping|travel|entertainment|spa`, `/r/<slug>`, `/api/shared-results/<slug>` (GET), `/api/qr/entry`, `/share-target`.
* Private (server-enforced 401/403, robots only mirrors): `/chat`, `/profile`, `/admin`, `/api/*` writes, `/api/admin/*`.
* `shared_results`: no anon SELECT policy at all; public reads are a service-role projection of public columns; INSERT is service-role only (so sanitization cannot be bypassed); owner may SELECT/withdraw own rows. `anon_identity_map`: service-role only. `fn_shared_result_bump`: service-role only. All ADR-019 grants pass `check-sql-grants`.
* Share creation resolves the message through the caller's RLS client — a client can never publish arbitrary text under a TappyAI URL.
* Zalo identity: server-signed HMAC cookie; never a client claim.

## 5. Cost analysis

| Component | LLM | API | Cloud | Storage | Class |
|---|---|---|---|---|---|
| Analytics events (7 types) | 0 | 0 | existing `/api/track` batch | rows in existing `user_events` (~1 KB each) | negligible |
| anon→user stitch | 0 | 0 | 1 upsert per authenticated batch carrying anon_id | `anon_identity_map` (32 B/row) | negligible |
| Share create (preview + confirm) | **0** (deterministic sanitizer) | 0 | 2 route calls, 1 RLS read, 1 INSERT | `shared_results` ≤64 KB/row (typically 3–10 KB) | negligible |
| Public page `/r/<slug>` | **0** | 0 | ISR 1h → ~0 DB reads per view after first | — | $0 per view |
| OG card | 0 | 0 | edge render once per (slug, og_version); immutable cache | — | negligible |
| Follow-up from a share | existing quota (≤ `ANON_DAILY_LIMIT`, ≤ per-share cap) | — | existing | — | **bounded** existing spend |
| Counters | 0 | 0 | 1 UPDATE per view batch / ask | — | negligible |
| Hubs / sitemap / robots | 0 | 0 | ISR 1h, 1 indexed read | — | $0 |
| QR | 0 | 0 | SVG computed, 7-day cache | — | $0 |
| Web Share Target / Android Direct Share | 0 (until the user's own query) | 0 | 0 | 0 | $0 |
| Zalo verify | 0 | Zalo Open API (free) 1/day/user | 1 route call | 0 | $0 |
| Growth report | 0 | 0 | admin-only, ≤200k rows, ≤90 days | — | negligible |
| Rate limiting | — | Upstash when configured (existing) | — | — | existing |

**No new paid service, vendor, queue, database or model was introduced.**

## 6. Anonymous follow-up policy (single source: `product.ts`)

`ANON_DAILY_LIMIT` (hard, existing) · `ANON_SOFT_SIGNUP_GATE_AFTER = 3` (soft nudge on the public page) · `SHARE_FOLLOW_UP_DAILY_LIMIT_PER_IDENTITY = 3` (per slug, identity = uid → anon cookie → IP) · `SHARE_DAILY_LIMIT = 20` / `SHARE_DAILY_LIMIT_PER_IP = 60` (share creation) · Zalo cap = `ANON_DAILY_LIMIT` per signed Zalo hash.

## 7. Not done / deferred (explicit)

* TGDĐ — enum only, by design.
* Zalo Mini App project itself (needs registration; boundary + docs done).
* Image shares on Android (`image/*` not claimed — picker safety) and Web Share Target files (needs a service worker).
* Affiliate `click_id`: the contract carries `click_id` on `result_action`; the current outbound builders do not issue one, so it is `undefined` today. Attribution is preserved via `result_id` + `anon_id`.
* A daily rollup of `computeGrowthMetrics` output (the report reads bounded raw events; fine at G1 scale).
