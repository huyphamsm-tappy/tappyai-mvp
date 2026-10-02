# TappyAI G1 Growth — Implementation & Verification Report

**Branch:** `feat/g1-growth` · worktree `D:\Claude\Projects\TappyAI\.worktrees\g1-growth`
**Base:** rebased onto `integration/v3-canonical` @ `1ec07bb` (as instructed; local canonical has since moved to `c1e1227`, 3 commits further — a later rebase is the owner's call)
**Date:** 2026-09-18 · **State:** Implemented → Verified → Committed → **Awaiting Owner Review** · **NOT pushed, NOT merged, NOT deployed, migration NOT applied**

Release Gate status per phase: `Implemented · Tested · Not tested · Blocked · Requires owner action` — no phase is *Completed* (that needs Production Verification + Owner Approval).

---

## 1. Architecture implemented

| Phase | Status | Notes |
|---|---|---|
| G1-A Measurement spine | Implemented · Tested (unit, jsdom) | contract, one `anon_id` + cookie mirror, attribution, 7 emitters, ingestion stitch |
| G1-B Shared result / public web | Implemented · Tested (unit + real-Postgres) | `shared_results`, `/r/[slug]` ISR, OG card, JSON-LD, public JSON |
| G1-C Privacy + cost guardrails | Implemented · Tested | sanitizer before persistence; per-share follow-up cap; "no LLM" import-graph guard |
| G1-D Share loop | Implemented · Tested (route + component contracts) | preview → confirm → ShareMenu; `share_created`, `result_action:share` |
| G1-E Zalo Mini App | Boundary implemented · Tested · **Requires owner action** | deep link, launch parse, signed identity cap, verify route, docs; Mini App itself not registered |
| G1-F Android Direct Share | Implemented · Tested (JVM, 8/8) | `ACTION_SEND text/plain` → chat prefill; images deliberately not claimed |
| G1-G Web Share Target | Implemented · Tested | manifest `share_target` (GET) → `/share-target` → `/chat?q=` |
| G1-H QR / POS | Implemented · Tested | allow-listed entries, `?src=qr_pos`, SVG route |
| G1-I GEO / discovery | Implemented · Tested (build-safety) · **Not tested: live crawl** | 5 hubs, robots, sitemap, referrer attribution |
| G1-J Reporting / gates | Implemented · Tested (pure maths, 13 cases) | `computeGrowthMetrics`, admin endpoint |

Full component map: `docs/growth/G1_GROWTH_ARCHITECTURE.md`.

## 2. Files changed

**New (web):** `src/lib/analytics/{analytics-contract,anonId,attribution,g1Events,g1Ingestion,growthMetrics,growthReportService}.ts` · `src/hooks/useG1Session.ts` · `src/lib/share/{sharedResult,publicSanitizer,sharedResultStore,slug,shareRequest,followUpGuard,sharedResultMetadata,renderPublicMarkdown}.ts` · `src/lib/structuredContent/{parseCta,parseFollowups}.ts` (moved from ChatInterface) · `src/lib/growth/{qrEntry,shareTarget}.ts` · `src/lib/zalo/{miniApp,identity}.ts` · `src/lib/discovery/domainHubs.ts` · `src/app/r/[slug]/{page,PublicResultView,PublicResultClient,PublicPlacesList}.tsx` · `src/app/r/[slug]/og.png/route.tsx` · `src/app/(discovery)/[domain]/page.tsx` · `src/app/share-target/page.tsx` · `src/app/robots.ts` · `src/app/sitemap.ts` · `src/app/api/shared-results/{route,preview/route,[slug]/route}.ts` · `src/app/api/qr/entry/route.ts` · `src/app/api/zalo/mini/verify/route.ts` · `src/app/api/admin/analytics/growth/route.ts` · `src/components/share/SharePreviewDialog.tsx`
**Modified (web):** `src/app/api/chat/route.ts` (share guard + Zalo cap + context block) · `src/app/api/track/route.ts` (G1 known types + side effects) · `src/components/ChatInterface.tsx` (query/result_action, parser re-exports, data attrs) · `src/components/chat/MessageActionBar.tsx` (share → preview) · `src/components/TrackingProvider.tsx` · `src/lib/analytics/authEvents.ts` (signup) · `src/lib/tracking/envelope.ts` (anon_id source) · `src/lib/config/product.ts` (share policy) · `src/lib/i18n/{share,serverMessages,useTranslation}.ts` · `public/manifest.json` · `src/lib/auth/anonymousWriteBoundary.test.ts` (route classification)
**Android:** new `navigation/IncomingShareParser.kt` + test; modified `MainActivity.kt`, `navigation/AppNavHostViewModel.kt`, `AndroidManifest.xml`
**DB:** `supabase/migrations/20260913_g1_growth_foundation.sql`, `supabase/migrations/rollback/20260913_g1_growth_foundation_rollback.sql`, `supabase/tests/g1_growth_foundation.test.ts`
**Docs:** `docs/growth/{G1_GROWTH_ARCHITECTURE,ZALO_MINI_APP,G1_IMPLEMENTATION_REPORT}.md`
**Tests (new):** 14 web suites, 1 db suite, 1 Android suite.

## 3. Database changes (NOT applied)

`public.shared_results` (id, slug UNIQUE, owner_id → auth.users SET NULL, query, payload jsonb, domain, locale, status CHECK public|removed, og_version, view_count, ask_count, created_at, updated_at) · indexes `shared_results_owner_idx`, `shared_results_public_domain_idx` (partial, status='public') · RLS ON; policies `shared_results_owner_select`, `shared_results_owner_withdraw` (authenticated, own rows) · grants: REVOKE ALL from PUBLIC/anon/authenticated; `authenticated` SELECT + UPDATE(status, updated_at) only; `service_role` ALL.
`public.anon_identity_map` (anon_id, user_id → auth.users CASCADE, linked_at; PK both) · RLS ON, no policies · service_role only.
`fn_shared_result_bump(text, text, int)` SECURITY DEFINER · service_role only.
Guard: `check-sql-grants` 0 errors. Idempotent; rollback provided. Apply per ADR-014 after owner authorization.

## 4. Analytics contract

Events: `first_visit, query, result_action, share_created, share_viewed, signup, return`.
Sources: `wedge_scam, share_out, zalo_mini, zalo_link, qr_pos, tgdd(reserved), geo_google, geo_chatgpt, direct_share, web_share_target, direct`.
Actions: `outbound_booking, outbound_map, outbound_tiktok, follow_up_query, share`.
Definitions v1: active = ≥1 query; activated = result_action in first-query session; D7 = query on day 5–9 after first-query VN day; useful result = ≥1 result_action; TGDĐ activation = first query with source tgdd only. Identity resolves through `anon_identity_map`; views dedup per (share, viewer).

## 5. Privacy — what can / cannot enter a shared payload

See table in `G1_GROWTH_ARCHITECTURE.md §3`. In one line: only the answer's public projection (prose without markers/memory lines, https buttons, storable images, plan/shopping/places projections) and a generalised question; never identities, contact data, first-person addresses, budgets, memory, tokens, prompts, Places photos. Enforced by `validateSharedResultPayload` (forbidden keys at any depth, residual markers, size) at the store boundary and pinned by `publicSanitizer.test.ts`.

## 6. Cost analysis

Every component is **$0 / negligible**; the only inference path is the existing `/api/chat` under the existing `ANON_DAILY_LIMIT`, further capped per share and per Zalo identity. Public views, OG cards, hubs, sitemap, QR, Share Target, Direct Share: zero LLM, zero new API, ISR/edge-cached. No new vendor, queue, database, model or paid service. Full table: `G1_GROWTH_ARCHITECTURE.md §5`.

## 6b. Closing guards (2026-09-18)

**Guard 1 — `POST /api/zalo/mini/verify` classification.** Inspected implementation + callers (none in-repo; sole intended caller is the Zalo Mini App webview). Classified as: **private API endpoint · POST only (no GET/HEAD → not crawler-accessible) · not Tappy-authenticated (pre-identity) · authorized by server-to-server Zalo token verification · Mini-App-only by purpose · not a shared-result page · not GEO content.** Hardened: every response carries `X-Robots-Tag: noindex, nofollow` + `Cache-Control: no-store`; already under `/api/` (robots-disallowed) and never in the sitemap; the JSON body is `{ok:true}` or an error code, the HMAC lives only in the httpOnly cookie, the secret never leaves. Locked by `src/lib/zalo/zaloVerifyRouteBoundary.test.ts` (8 tests: exports, robots/sitemap, no AI/store imports, no Tappy auth, 503-without-secret, 401-without-leak, success-shape, explicit classification in `anonymousWriteBoundary`).

**Guard 2 — hub i18n.** All hub text (5 chrome labels + the full copy of 5 hubs) moved into the canonical i18n system as a namespaced module `src/lib/i18n/discovery.ts` (`hub.*`, vi + en), layered into `useTranslation` exactly like `share.ts`/`landing.ts`; `domainHubs.ts` owns no text. The hub renders through `HubBody` (client component, SSR = product locale `vi` for crawlers, reconciled to the visitor's locale after hydration — the app-wide pattern); JSON-LD FAQPage emitted in both languages; route structure unchanged. Locked by `src/lib/i18n/discoveryI18n.test.tsx` (key parity, no untranslated English, page layer carries no literal Vietnamese, renders vi and en, crawlable links in both).

## 7. Tests

| Suite | Result |
|---|---|
| Web full run (`npm test`, app + db projects) — first pass | 11,133 passed · 13 failed · 44 skipped (569 files) |
| Of the 13: caused by G1 → fixed | 5 (route classification, error-message contract, `searchParam` helper, share wording, hardcoded-VN ratchet) |
| Of the 13: pre-existing at base `7b0ee0c` (verified failing on the canonical worktree too) | 8 in 6 files: `brandRegistryAndroidParity`, `androidDealsParity`, `androidHardcodedUiStrings`, `androidLanguageAuthority`, `crossPlatformParity` — Android parity work later fixed in canonical `1ec07bb`; not G1 |
| G1 web suites (analytics 62, share 191 incl. routes, growth 10, zalo 10) | all passing |
| DB suite `g1_growth_foundation` (embedded PostgreSQL, real migration + ACLs) | 19/19 · `portAllocation` passes |
| Android JVM `IncomingShareParserTest` / `ShellDeepLinkTest` | 8/8 · 9/9 (`:app:testDebugUnitTest`) |
| `tsc --noEmit` / `next lint` / `architecture:check` / `check:sql-grants` | 0 errors · 0 errors, 0 warnings in G1 files · 12/12 rules · 0 errors |

**Second full run (after fixes, pre-rebase):** 11,147 passed · 8 failed (the same baseline files) · required-suites gate OK.

**Post-rebase full run (onto `1ec07bb`):** 11,366 passed · 9 failed · 44 skipped (583 files) · required-suites gate **OK (45 required suites executed)** · DB project 26 files / 704 tests / 0 failed · Android `:app:testDebugUnitTest` 566 tests / 0 failures · tsc 0 · lint 0 · architecture 12/12 · sql-grants 0.
The 9 failures, each verified as not G1:
· 7 = known Android-parity baseline (`brandRegistryAndroidParity` 1, `androidDealsParity` 4, `androidHardcodedUiStrings` 1, `crossPlatformParity` 1) — `androidLanguageAuthority` now passes after the rebase.
· 1 = `chatPlaceDecisionWiring.test.tsx` — a base-commit inconsistency: the test committed at `1ec07bb` asserts the pre-`decisionSurface` route while the route committed at `1ec07bb` already uses `rendersDecisionCardFor`; the corrected test exists only as an uncommitted edit in the canonical worktree. File untouched by G1 (byte-identical to `1ec07bb`).
· 1 = `scripts/architecture/vendorCacheRule.test.ts` — 5 s timeout while spawning `check.mjs` under full-suite load with Gradle running concurrently; passes in isolation (10/10) and `check.mjs` itself passes 12/12.

🚨 **Base-commit defect (owner):** `1ec07bb` (and `c1e1227`) import `src/lib/ai/decisionSurface.ts`, which was never committed — it is untracked in the canonical worktree. For verification the two files were copied into the G1 worktree **untracked and NOT part of the G1 commit**. The canonical branch does not typecheck at those commits until that module is committed there.

**Not tested:** live Zalo verification (needs credentials + VN-region), OG image rendering against real merchant CDNs, a live crawl of hubs/sitemap, Android on-device share-sheet flow (JVM parser only; Activity/manifest wiring compiles), Web Share Target on an installed PWA, production ISR behaviour.

## 8. External / manual actions (owner)

1. **Review + authorize** `20260913_g1_growth_foundation.sql` (ADR-014 checklist); apply; run the section-by-section verification; keep the rollback handy.
2. **Env:** `ZALO_IDENTITY_SECRET` (≥32 chars) to enable `/api/zalo/mini/verify`; `NEXT_PUBLIC_ZALO_MINI_APP_ID` once a Mini App exists. Without them the Zalo paths are inert.
3. **Zalo Mini App registration** + deep-link format verification + ZMP build + review (`docs/growth/ZALO_MINI_APP.md §5`). Decide on VN-region verification given the `-501` constraint.
4. **Upstash** already provisioned in Production — the new caps use it automatically; nothing to add.
5. **Android App Links** (`assetlinks.json`) remain out of scope, as before.
6. **Rebase** `feat/g1-growth` onto current `integration/v3-canonical` (expected touch points: `ChatInterface.tsx`, `chat/route.ts`, `product.ts`).

## 9. Remaining risks

* Sanitizer is regex-based: a personal detail phrased outside the patterns can survive into a public page. Mitigation: the preview is the user's explicit review; owner can withdraw; titles are user-editable. Add patterns as real cases appear.
* `EMIT_TAPPY_PLACES` is flag-gated off, so place decisions share as prose + buttons only (Google Places storage terms) — by design, but the public card is less rich for food/places.
* k-factor v1 counts share-attributed *first* queries; cross-device viewers who sign up on another device are under-counted until stitched.
* `androidLanguageAuthority` fails at the G1 base commit but passes on newer canonical — the rebase resolves it.
* The Zalo `-501` region constraint may make real verification impossible from Vercel-US; the fallback (anonymous quota only) is safe but weaker.

## 10. Recommended next phase

1. Owner review → apply migration → deploy to preview → verify one real share end-to-end (chat → preview → `/r/<slug>` → OG in Zalo/Messenger → follow-up → cap) and read `/api/admin/analytics/growth`.
2. Gate 0: recruit 30–50 users, watch activation for two weeks; do **not** open channels before it reads ≥ 50 %.
3. Then G1-E proper (Mini App submission) and Android image shares, in that order.
