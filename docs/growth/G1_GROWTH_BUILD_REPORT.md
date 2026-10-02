# TappyAI — Master Growth Hacking Technical Build: report

**Phase:** build the growth machine before production release (technical only)
**Branch:** `feat/g1-growth` (worktree `.worktrees/g1-growth`), base `integration/v3-canonical@1ec07bb`
**Date:** 2026-09-18 · **Status:** Implemented → Verified → Committed → Awaiting Owner Review
**Not done by instruction:** no deployment, no production migration, no real users, no Zalo activation, no TGDĐ, no paid advertising.

---

## 1. Executive summary

**After this build, TappyAI has these technically available acquisition surfaces:**

| Class | Count | Surfaces |
|---|---|---|
| **A — True acquisition** (can expose Tappy to someone who does not know it) | **3** | (1) Chat share-out → public `/r/<slug>` + OG card — **now from Web AND Android**; (2) **Scam-verdict share-out** (wedge: anonymous-callable, spreads through the same Zalo/Messenger groups scams spread in); (3) **Second-generation sharing** from the public page (a recipient passes an answer on before signing up). Each is a link a stranger can open with no install and no account. |
| **B — Assisted acquisition** (needs an existing user, indexing, or placement) | **4** | GEO hubs `/food…/spa` + `/scam-shield` + `/r/*` in sitemap with WebSite `SearchAction`/Organization/FAQ/QAPage JSON-LD (needs indexing); QR/POS entries (needs physical placement); OG/social cards (enhance A); ShareMenu handoffs (Facebook/Zalo/copy/OS, now with share text). |
| **C — Retention / re-entry** | **3** | Web Share Target (installed PWA), Android Direct Share inbound (installed app), public-page follow-up box (pulls a recipient into chat). |
| **D — Future / blocked** | **4** | Android App Links & iOS Universal Links (association files served once configured; apps do not yet claim https links), iOS App Clip / share extension (needs Xcode), Zalo Mini App (untouched), TGDĐ (untouched). |

All A-class surfaces cost **0 LLM per view**; the only inference is a recipient's own bounded follow-up.

## 2. Growth channel inventory

| Channel | Status | Acquisition class | User flow | Cost (marginal) | Measurement | Risk |
|---|---|---|---|---|---|---|
| Web chat share-out | Implemented (G1) | A | signed-in user → preview → confirm → `/r/<slug>` → ShareMenu | 1 INSERT; 0 LLM | `share_created`, `share_viewed`, `share_id` bridge | sanitizer is regex-based (preview + withdraw mitigate) |
| **Android chat share-out** | **Implemented (this phase)** | A | tap Share on a persisted turn → preview dialog → confirm → system share sheet with the public URL | same | same events via the web page the recipient opens; sharer-side events not emitted on Android (Android has no G1 tracker — see §7) | anonymous sessions get "sign in" (server 403) |
| **Scam-verdict share-out** | **Implemented (this phase)** | A | `/scam-shield` → verdict → "Cảnh báo cho mọi người" → `/r/<slug>` (kind `scam_check`) → ShareMenu | check providers (cached, no LLM) + 1 INSERT | `share_created{domain:'scam'}`, `result_action:share`, landing `wedge_scam` | none new; per-IP burst + daily caps; payload never republishes the URL query |
| **Second-generation share (anonymous child shares)** | **Implemented (this phase)** | A (via B) | recipient asks on `/r/<slug>` → answer persisted (existing conversations API) → "Chia sẻ câu trả lời này" → child page (noindex, unlisted) | 1 INSERT | `share_created{parent_share_id}`; metrics `secondGeneration`, `viewerToShare` | cap `SHARE_DAILY_LIMIT_ANON=3`; child pages unlisted until owner signs up |
| Public result page + OG + QAPage JSON-LD | Implemented (G1) | A (surface) | any link → full answer, no install/login | ISR; 0 LLM | `share_viewed` dedup per (share, viewer) | — |
| Anonymous follow-up | Implemented (G1) | C→B | ask box → existing `/api/chat` | bounded LLM (≤3/share/identity/day, ≤5/day) | `query{is_follow_up}`, `result_action:follow_up_query` | — |
| GEO hubs + sitemap + robots + referrer attribution | Implemented (G1) | B (A after indexing) | search/AI engine → hub → `/chat?q=` | ISR; 0 LLM | `geo_google` / `geo_chatgpt` | no indexing yet |
| **WebSite SearchAction + Organization JSON-LD on `/`** | **Implemented (this phase)** | B (enabler) | engines → sitelinks search → `/chat?q=` | bytes | as above | — |
| QR / POS entry | Implemented (G1) | B | printed QR → `/food?src=qr_pos` | SVG cached | `qr_pos` | no placement yet |
| Web Share Target | Implemented (G1) | C | other app → Tappy PWA → `/chat?q=` | 0 | `web_share_target` | — |
| Android Direct Share inbound | Implemented (G1) | C | other app → Tappy → chat prefill | 0 | none on Android (§7) | — |
| **App Links / Universal Links association files** | **Prepared (this phase)** | D | — | 0 | — | inert until env is set; apps do not claim links |
| Zalo Mini App | Boundary only (G1) | D | — | 0 | — | untouched by instruction |

## 3. What was implemented (this phase)

### 3.1 Scam-verdict share-out (wedge)
- **Files:** `src/lib/share/scamSharePayload.ts` (+test), `src/app/api/scam-shield/share/route.ts` (+test), `src/app/scam-shield/ScamShareButton.tsx`, `src/app/scam-shield/ScamShieldResult.tsx` (mount), `src/app/scam-shield/ScamShieldView.tsx` (wedge attribution), `src/lib/i18n/share.ts` (`share.scam.*`, `publicResult.checkAnotherLink`), `src/app/r/[slug]/PublicResultView.tsx` (scam CTA), `src/app/r/[slug]/og.png/route.tsx` (label), `src/lib/share/sharedResult.ts` (`kind`, `scam` domain), `src/app/sitemap.ts` (`/scam-shield`), `src/lib/config/product.ts` (`SCAM_SHARE_DAILY_LIMIT_PER_IP`).
- **Architecture:** the deterministic `CheckResult` (blocklist/DNS/redirect/SSL/Web Risk/WHOIS, cached, no LLM) is projected server-side into a `SharedResultPayload{kind:'scam_check', domain:'scam'}`; the existing `/r/<slug>` page, OG card, attribution and follow-up render it unchanged.
- **User flow:** check a link → "Cảnh báo cho mọi người" → public page → ShareMenu → recipient reads verdict, official-site button, "Kiểm tra một link khác với Tappy" → `/scam-shield?src=share_out`.
- **Attribution:** landing on `/scam-shield` as the session's first page → `wedge_scam`; `share_created{domain:'scam'}`.
- **Privacy:** only host+path of the checked URL (query/fragment never republished — a victim/tracking token stays private); evidence `detail`/`dataPoints` never published; validator + forbidden-key walk apply.
- **Cost:** provider checks (existing, cached) + 1 INSERT; anonymous allowed because content is server-generated; burst limit = check route's, daily 30/IP.
- **Tests:** 7 payload tests, 4 route tests, classification in `anonymousWriteBoundary`.

### 3.2 Anonymous second-generation sharing + share ancestry
- **Files:** `src/lib/share/sharePolicy.ts` (+test), `src/app/api/shared-results/route.ts`, `preview/route.ts`, `src/lib/share/shareRequest.ts` (`parentSlug`), `sharedResultStore.ts` (`parent_id`, `owner_is_anonymous`, unlisted filter), `sharedResultMetadata.ts` (noindex), `src/components/share/SharePreviewDialog.tsx` (parentSlug, unlisted notice), `src/app/r/[slug]/PublicResultClient.tsx` (persists the follow-up thread via the existing `/api/conversations`; "Share this answer"), `src/lib/analytics/{analytics-contract,g1Events,growthMetrics}.ts` (`parent_share_id`, `secondGeneration`, `viewerToShare`), `supabase/migrations/20260918_g1b_share_ancestry.sql` (+rollback, +DB tests), `product.ts` (`SHARE_DAILY_LIMIT_ANON`).
- **Rule:** real account → unchanged; anonymous → only a child of a resolving public share, ≤3/day, page public but `noindex` and excluded from sitemap/hubs until the owner is an account. Preview and create share one decision (`decideSharePolicy`) so the preview never promises what create refuses.
- **Tests:** policy 4, routes +3, metrics +1, DB +3, metadata +2.

### 3.3 Android share-out parity
- **Files:** `android/.../chat/data/SharedResultApi.kt`, `SharedResultRepository.kt`, `ChatModule.kt` (DI), `chat/ChatViewModel.kt` (`SharePublicState` machine), `chat/SharePublicDialog.kt`, `chat/MessageActionBar.kt` (`onSharePublic` hook, plain-text fallback kept), `chat/ChatScreen.kt` (dialog mount), `res/values{,-vi}/strings_chat.xml` (14 strings each), test `SharedResultRepositoryTest.kt`.
- **Flow:** Share icon on a persisted turn → server preview (sanitized) → editable title → confirm → public URL → system share sheet / copy; anonymous → `chat_error_login_required`; 429 → "tomorrow"; 422 → not shareable.
- **Tests:** 4 JVM tests (projection, outcome mapping, URL passes `TappyShare.isShareableUrl`); full `:app:testDebugUnitTest` green (see §5).

### 3.4 Web/browser distribution primitives
- `src/lib/discovery/siteJsonLd.ts` + `src/app/(home)/page.tsx` — WebSite `SearchAction` → `/chat?q=`, Organization (+test).
- `ShareMenu` `text` prop; `SharePreviewDialog` passes the public question as share text.
- `src/lib/growth/appLinks.ts`, `src/app/.well-known/assetlinks.json/route.ts`, `src/app/.well-known/apple-app-site-association/route.ts` — env-driven, 404 until configured, public paths only (+test). Apps intentionally do not claim https links yet.
- `docs/growth/DISTRIBUTION.md` — Android / Web / iOS / QR audit and roadmap.

### 3.5 Measurement additions
- `share_created.parent_share_id`; `wedge_scam` now emitted (Scam Shield landing); attribution first-touch identity made exact with a landing nonce; metrics `shares.secondGeneration`, `viewersWhoShared`, `viewerToShare`.

## 4. What was NOT implemented, and why

| Item | Reason |
|---|---|
| Zalo Mini App activation / credentials | Out of phase by instruction; boundary untouched. |
| TGDĐ | Out of phase by instruction; enum reserved only. |
| Paid ads / paid growth tooling | Out of phase by instruction. |
| iOS Universal Links / App Clip / share extension | Requires Xcode/macOS and App Store Connect config; server-side AASA prepared; documented in `DISTRIBUTION.md`. |
| Android App Links intent-filter + native `/r/*` handling | Requires the release signing fingerprint (owner) and a native public-result screen; opening `/r/*` in the browser is the acquisition surface today, so claiming links now would reduce reach. Association file prepared. |
| Android Sharing Shortcuts, widgets, Quick Settings, launcher shortcuts | Retention/re-entry only — no acquisition value; deferred. |
| PWA install prompt | Retention only; deferred. |
| Email/SMS ShareMenu targets | The target set is an owner-pinned contract (`shareTargets.test.ts`); the OS share sheet already reaches both. |
| Android-side G1 analytics events | Android has no G1 tracker; the recipient side (web page) is measured. Adding `TappyAnalytics` events on Android is a separate, larger change. |
| Image shares (Android / Web Share Target files) | Picker safety / needs a service worker; deferred. |
| Intent pages beyond the five hubs ("best food near me"…) | Would risk thin mass pages; the hubs + indexed `/r/*` pages are the intent surface. |

## 5. Growth loop map (entry points marked ►)

```text
DISCOVERY        ► Google/Bing/AI engines (hubs, /scam-shield, /r/* in sitemap; SearchAction JSON-LD)
                 ► a link in Zalo/Messenger/FB/SMS (chat share-out — Web ► and Android ►; scam-verdict share-out ►; second-gen share ►)
                 ► printed QR (?src=qr_pos)           ► installed-app re-entry (Share Target / Direct Share)
   ↓
FIRST VISIT      /r/<slug> · /food…/spa · /scam-shield · /  (first_visit + source)
   ↓
QUERY            /chat?q=  ·  public-page follow-up (shareSlug)  ·  scam check   (query)
   ↓
USEFUL RESULT    answer / plan / shopping decision / scam verdict  (≥1 result_action)
   ↓
ACTION           outbound_map · outbound_booking · outbound_tiktok · follow_up_query · share
   ↓
SHARE            Web preview→confirm ► · Android preview→confirm ► · scam verdict ► · public-page child share ►
   ↓
NEW VISITOR      /r/<slug> (+OG card)  — share_viewed, share_id bridged
   ↓
FOLLOW-UP        bounded anonymous ask  →  soft gate (3)  →  quota wall (5)
   ↓
SIGNUP           /login?returnTo=/r/<slug>  — signup{first_source, first_share_id}; anon→user stitched
   ↓
NEW USER → NEW RESULT → SHARE  ↺   (or, before signup: child share ↺ noindex/unlisted)
```

## 6. Cost map

| | Fixed | Marginal per visitor | Marginal per interaction | LLM | External API | Storage | Bandwidth |
|---|---|---|---|---|---|---|---|
| `/r/*`, hubs, `/scam-shield`, sitemap, robots, JSON-LD | ISR build | ~0 (cached) | — | none | none | — | HTML/OG bytes |
| OG card | — | 0 (one render per version) | — | none | none | none | image bytes |
| Chat share (Web/Android) | — | — | 1 RLS read + 1 INSERT | none | none | ≤64 KB/row | — |
| Scam-verdict share | — | — | cached provider checks + 1 INSERT | none | existing providers (Web Risk = existing GCP capability, free tier) | ≤64 KB/row | — |
| Child share | — | — | 1 INSERT (+ the follow-up's existing conversation save) | none | none | ≤64 KB/row | — |
| Anonymous follow-up | — | — | existing chat pipeline, capped | **bounded** | existing | existing | — |
| Analytics | — | batched existing `/api/track` | rows in `user_events` | none | none | ~1 KB/event | — |
| Association files / QR | — | 0 | 0 | none | none | none | bytes |

**No paid API, LLM provider, infrastructure service, image-generation service or paid acquisition introduced** (`package.json` unchanged). Near-zero marginal acquisition cost holds: every acquisition surface is static/cached/deterministic; inference happens only when a person deliberately asks, under existing caps.

## 7. Measurement readiness

| Metric / mechanism | Implemented | Technically testable | Data |
|---|---|---|---|
| 7 events, 11 sources (incl. `wedge_scam` now emitted), 5 action types | yes | yes (contract + emitter tests) | **none until production** |
| anon_id (+ cookie mirror), session/first-touch attribution (nonce-exact) | yes | yes | none |
| share_id bridge, `parent_share_id` (referral chain / ancestry) | yes | yes | none |
| anon → user stitching (`anon_identity_map`) | yes | yes (DB) | none |
| Activation, D7 (day 5–9), share rate, views/share, viewer→query, viewer→signup, **viewer→share, second-generation shares**, k-factor, Gate 0/1/2 | yes (`computeGrowthMetrics`) | yes (15 pure tests) | none — gates report `insufficient_sample` |
| Android sharer-side events | **no** | — | — |

**Observed today: users = 0 · shares = 0 · acquisition = 0 · k-factor = unavailable · D7 = unavailable.** Technical readiness is not traction.

## 8. Test results (post-build, rebased tree)

- `npm test` (app + db): **11,399 passed · 8 failed · 44 skipped** (588 files). Required-suites gate **OK (45)**. DB project 26 files / 707 tests / 0 failed.
- The 8 failures are the **same baseline set** documented in `G1_IMPLEMENTATION_REPORT.md §7` (7 Android-parity at base `1ec07bb` + `chatPlaceDecisionWiring` base inconsistency). **Zero new failures introduced by this build.**
- New/extended suites: scam payload 7, scam route 4, share policy 4, share routes 11, share lib 190+, growth 13, discovery 2+13, analytics 65, DB 20, Android `SharedResultRepositoryTest` 4 + `IncomingShareParserTest` 8; full `:app:testDebugUnitTest` green.
- `tsc` 0 · `next lint` 0 errors (0 warnings in growth files) · `architecture:check` 12/12 · `check:sql-grants` 0 errors.
- Verification-only: `src/lib/ai/decisionSurface.ts` (uncommitted in canonical, imported by `1ec07bb`) is present **untracked** in this worktree and not part of any commit.

## 9. Release readiness

- [x] Technical implementation complete (this phase's scope)
- [x] Tests pass (all G1/growth suites; only the documented baseline failures remain)
- [x] Privacy verified (sanitizer/validator tests; scam payload never republishes URL query; child pages noindex/unlisted; association files public-path-only)
- [x] Attribution verified (source/share_id/parent_share_id/first-touch tests; wedge_scam emitted)
- [x] Cost controls verified (no new dependency; caps on share, child share, scam share, follow-up; no LLM on public views — import-graph guard)
- [x] No production deployment performed
- [x] No real-user testing performed
- [x] No Zalo activation
- [x] No TGDĐ work
- [x] No paid advertising
- [ ] Ready for next production release — **pending owner review of the commit and authorization of the two migrations** (`20260913_g1_growth_foundation.sql`, `20260918_g1b_share_ancestry.sql`)

## 10. Recommended release sequence (for the owner; not executed)

1. Review commit(s) on `feat/g1-growth`; decide rebase onto current canonical (`c1e1227`+) and commit `decisionSurface.ts` there.
2. Authorize + apply both migrations (ADR-014), then deploy to preview.
3. Preview verification of one real loop per A-class surface: web share, Android share, scam-verdict share, child share — each ending in `/api/admin/analytics/growth` showing the events.
4. Production release → real-user UAT (Gate 0: 30–50 recruited users) → measure → gates → iterate. Only then consider Zalo Mini App / App Links / iOS.
