# Android ↔ Web Production — Master Parity Gap Report

**Date:** 2026-07-26 · **Baseline:** working tree (uncommitted included), branch `feat/backoffice-phase0`, HEAD `807d77b` — see [00_BASELINE_SNAPSHOT.md](00_BASELINE_SNAPSHOT.md)
**Source of truth:** Web production, distilled in `docs/freeze/Web_V1_Platform_Freeze_2026-07-25/`
**Method:** 10 parallel domain auditors reading the *actual current code* on both sides (not status docs). Per-domain detail in `domain_01…10_*.md`.

> **Status: DRAFT FOR OWNER APPROVAL.** No code will be written until this report is approved. After approval, features are implemented **one at a time**, each with regression + Web-comparison + verification report, and **no move to the next feature until you approve it.**

---

## 1. Headline verdict

Android is **much closer to Web than the stale status docs claim** — nearly every feature has a real native implementation on the shared backend. The gaps are concentrated, not systemic:

- **One P0 that blocks everything:** the committed tree does not build.
- **A cluster of P1 behavioural/rendering gaps** on otherwise-shipped features (chat rendering, comment replies/reactions, fortune engine, split bill, location, music legal attribution).
- **Two owner-sequenced BLOCKED items** (Zalo, anonymous tier) needing a backend contract decision.
- Most gaps are **pure client-side ports with zero backend work.**

A second, valuable outcome: the audit **corrected 11 inaccuracies in the freeze doc** (see §5) — several "build this" items turned out to be N/A, and several "blocked" items are actually shippable. This materially changes the plan versus the freeze doc's §7.

---

## 2. Severity-ranked gap register

Legend: **C** = client-only fix · **B** = needs backend/contract · **L** = legal · **⚠doc** = contradicts freeze-doc classification

### P0 — Build / release blockers (prerequisite, not feature work)

| # | Gap | Fix | Evidence |
|---|-----|-----|----------|
| P0-1 | **Gradle foundation untracked** — `settings.gradle.kts`, `gradle/libs.versions.toml`, `gradle/wrapper/*`, `gradlew.bat` exist on disk but were never committed. Only 1 commit ever touched `android/`. Clean checkout has no module includes / no version catalog → **cannot build**. | C (git add + verify) | domain_10; freeze §1.1 still current |
| P0-2 | **No POSIX `gradlew`** (only `.bat`) → Linux/macOS/CI has no wrapper. | C | domain_10 |

### P1 — Major functional parity gaps

| # | Gap | Fix | Evidence |
|---|-----|-----|----------|
| P1-1 | **Chat: no live incremental token rendering.** ViewModel buffers the whole stream and appends only after `collect{}` completes; UI = skeleton → whole message. Tokens *do* stream over the wire; the VM discards the benefit. ⚠doc (freeze calls Streaming "READY"). | C | `ChatViewModel.kt:298-315`; Web `useSmoothText` |
| P1-2 | **Chat: `[TAPPY_PLAN]` itinerary card stripped, not rendered → content loss.** Android deletes the plan block; no TripPlanCard; plan-heavy replies leave a near-empty bubble + lose server plan photos. | C (+new card) | `RealChatRepository.kt:143` |
| P1-3 | **Reviews: comment replies (one-level `parentId`) absent** — replies render flat/un-indented. | B (round-trip; backend already stores it) | `ReviewComment.kt:3-9`, `ReviewNetworkDtos.kt:84-95` |
| P1-4 | **Reviews: comment reactions (6 emoji + `my_reaction`) absent** — no reaction UI, no `/api/comments/[id]/reactions` call. | B (endpoint exists) | `ReviewCommentSection.kt` |
| P1-5 | **Reviews: feed back-restore keyed on pager *index*, not clip ID** — the exact anti-pattern a settled production-bug contract forbids (trending re-orders between fetches). | C | `ReviewsScreens.kt:86` (contract §5.3) |
| P1-6 | **Location capability entirely absent** — no `ACCESS_FINE/COARSE_LOCATION`, no `FusedLocationProvider`. Blocks chat location bias, "Nearby" chip, For-You city boost. Server already accepts optional `userLocation`. | C | `AndroidManifest.xml:14-15` |
| P1-7 | **Fortune: no `fortuneEngine.ts` port** — Web readings are deterministic (date/subject-seeded, rotate daily/weekly/monthly); Android ships 3 static readings/sign, identical every visit. | C (pure port) | `ZodiacData.kt:41-101`, `CanChiData.kt:39-100` |
| P1-8 | **Fortune: Tu-vi "Lifetime" tab absent** (overview + advice + 4 life stages). Not even listed in freeze item 13. ⚠doc | C | Web `TuViForm.tsx:189-195` |
| P1-9 | **Fortune: Tu-vi "By-Year" tab + 12-month breakdown absent** (year picker, can-chi compat, monthly cards). Not in freeze item 13. ⚠doc | C | Web `TuViForm.tsx:197-206` |
| P1-10 | **Split Bill entirely absent** in `android/` (grep = 0). Web ships a full feature (total, 2–20 people, tip presets, equal/custom). Pure client math, **no backend**. | C (pure port) | Web `src/app/split-bill/page.tsx` |
| P1-11 | **Music: CC-BY attribution not rendered (LEGAL).** Web shows "‹artist› · CC-BY · Jamendo" + source link; `audioUrl` already in the Android model. | C, L | `SoundDetailScreen.kt:166-302` |
| P1-12 | **Music: "Videos using this sound" grid is a text stub** (Web = 3-col thumbnail grid → `/reviews/{id}`); DTO omits the `videos[]` backend already returns. | C (DTO add) | `SoundDetailScreen.kt:379-402`, `MusicDtos.kt:52-60` |
| P1-13 | **FCM push not implemented** — firebase in catalog but never applied; no `google-services`, no `POST_NOTIFICATIONS`; toggle is a `MutableStateFlow(false)` stub. | C+B | `NotificationsViewModel.kt:20-27` |

### P1 — BLOCKED (owner-sequenced; need a backend contract decision *before* implementation)

| # | Gap | Blocker |
|---|-----|---------|
| P1-B1 | **Zalo login absent** — Web renders it; Android shows only Google + Email. | Needs a mobile token/deep-link contract (backend already accepts `platform=android`). |
| P1-B2 | **Anonymous 5-q/day tier absent** — hard login wall; `/api/auth/anonymous` never called. Forfeits top-of-funnel. | Product + backend session decision. |

### P2 — Minor functional gaps

| # | Gap | Fix | Evidence |
|---|-----|-----|----------|
| P2-1 | Chat: `/api/suggested-prompts` unconsumed (static string-resource chips on Home + Chat). | C | domain_01 |
| P2-2 | Chat: `userLocation` never sent (depends on P1-6); no `SavePlaceButton`; history resume has no GET-by-id, so resuming older conversations silently starts fresh. | C | `ChatRequest.kt` |
| P2-3 | Reviews: no 300 ms self-healing video watchdog (contract §5.2) — relies on `playWhenReady`+lifecycle only. | C | `ReviewVideoPlayer.kt:81-129` |
| P2-4 | Reviews: liked-reviews collection missing (Saved has favorites + bookmarks only). | B (source) | `SavedScreen.kt` |
| P2-5 | Reviews: in-feed attached-sound ("use this sound") playback missing — composer attaches, feed never plays the borrowed track over the muted clip. | C | `ReviewVideoPlayer.kt` |
| P2-6 | Reviews: Explore "Users" search segment + optimistic follow missing (search hits `feed?search=` only). | C | `ReviewSearchViewModel.kt:76` |
| P2-7 | Profile: **gender persistence missing** — Web saves via Supabase `auth.updateUser({data:{gender}})`; Android's Supabase client can too. ⚠doc (freeze says "blocked"). | C | `PreferencesViewModel.kt:70-72` |
| P2-8 | Auth: provider list **hardcoded** in `LoginScreen`, not driven by `/api/config` `auth.providers` (AppConfigDto drops the `auth` block). | C | `LoginScreen.kt:77-115` |
| P2-9 | Infra: upload limits/freemium **hardcoded `const val`** vs `/api/config` (limits/flags blocks dropped) — the 15s/60s drift vector; ADR-0004 deferred+untracked. | C | `ReviewComposerViewModel.kt:436-439` |
| P2-10 | Infra: `/api/track` logging-only (1 call-site) → zero personalization signal from Android. (Note: does **not** degrade the recs feed — see §5.) | C | `LoggingAnalyticsProvider.kt:12-13` |
| P2-11 | Fortune: Tarot 22 (Major Arcana) vs Web 78; missing lucky number/color + Ngũ Hành in readings. | C | `TarotCard.kt` |
| P2-12 | Utilities: **Translate read-aloud** sets `tts.language` without checking `setLanguage()` return → silent wrong-language (English) fallback on devices lacking the voice — the exact defect Web fixed. UNVERIFIED on-device. | C | `TranslateViewModel.kt:126-136` |
| P2-13 | Commerce (**backend bug, not client**): `inferFromBooking()` uses a cookie-scoped client, so for Bearer/native callers the `user_preferences` upsert is RLS-blocked and swallowed — personalization silently lost. | B (backend) | `src/app/api/bookings/route.ts` |

### P3 — Polish / cleanup

- Infra: `CachedContextEntity` dead scaffolding still fully plumbed into Room for the nonexistent `/api/context` — delete. (`FakeChatRepository` already correctly deleted.)
- Reviews: upload failures uniformly retryable (contract §5.8 partial; pre-upload validation catches most permanent cases); other-user profile is a list not a 3-col grid; in-app `ReviewShareSheet` is dead code (0 call sites) — live path is system `ACTION_SEND`; modals meet system-Back by Material3 default (no explicit `BackHandler`).
- Profile: memory `updated_at` not parsed (API returns it — ⚠doc); `created_at`/join-date placeholder; one i18n leak `"under "` (`Memory.kt:80`).
- Group dining: no Home quick-action entry for Group/Split Bill (Profile-menu only); budget chip English label interpolated into the VN AI-suggest prompt.
- Auth: deep-link parser reads `code` query param only; the `platform=android` fragment-token contract is unhandled (latent, matters when Zalo is wired).
- App Links: no `assetlinks.json` anywhere; only custom-scheme `tappyai://` — real `https://…/reviews/{id}` links don't open the app.

---

## 3. Correctly GATED / BLOCKED / N-A — **do NOT touch**

Confirmed correctly switched off on both platforms, or deliberately out of scope:

- **Membership / Pro** (`SHOW_PRO_UPGRADE=false`), **App Connections** (`SHOW_APP_CONNECTIONS=false`) — screens intact but unreachable. `ProfileScreen.kt:81,87`.
- **Facebook login** gated (`facebook.enabled=false`); **no email+password registration** (D5, OTP-only) — approved.
- **Music upload (UGC)** gated via `TappyComingSoonSheet` — correct.
- **Maps tab = placeholder + search-URL** — Web has *no* map-tile library at all; a tiled map would *exceed* parity. Approved D4 divergence.
- **Games = WebView over Web SuperTux** — approved architecture, well-implemented.
- **Delete Account Path B** (email-request via mailto + confirm dialog) — present, satisfies Play Store. `SettingsScreen.kt:178-213`.
- **Bookings pagination** — Web itself is a hard `.limit(20)` with no cursor; Android mirrors. Not a gap.

---

## 4. Backend / contract work required (for the B-tagged items)

1. **Comment reactions** — `/api/comments/[commentId]/reactions` DTO with per-reaction counts + `my_reaction` (endpoint exists; Android just needs to call + model it). *(P1-4)*
2. **Comment `parent_comment_id` round-trip** — add to `CommentDto` + send `parentId` (backend already stores/returns it). *(P1-3)*
3. **Liked-reviews source** — confirm/expose an endpoint for the current user's liked reviews. *(P2-4)*
4. **Gender / `created_at`** — Android can write gender to Supabase auth metadata client-side; `created_at` needs surfacing in `/api/profile` JSON. *(P2-7, P3)*
5. **Zalo mobile token/deep-link contract** — owner-sequenced. *(P1-B1)*
6. **Anonymous session contract** — owner-sequenced. *(P1-B2)*
7. **FCM `notifications/subscribe` wiring.** *(P1-13)*
8. **`inferFromBooking()` RLS fix** — this is a Web/backend bug affecting all Bearer callers. *(P2-13)*

---

## 5. Freeze-doc corrections (audit meta-finding)

The freeze package is from 2026-07-25; the tree moved. The audit found the doc is **wrong or stale in 11 places** — several change the plan:

1. Chat "READY — Streaming" **overstates** — streams at transport, not at render (P1-1).
2. §3.3 "`/api/config` ignored by Android" is **stale** — onboarding already consumes it (`OnboardingApi.kt:23`); only limits/flags/freemium/auth blocks are dropped.
3. **Deals rearchitecture (item 10)** — `partner_deals`, `POST /api/deals/[id]/click`, promo UI — **does not exist in this branch.** `src/lib/shopee-deals.ts` is still live. Item 10 is **N/A**; Android Deals correctly mirrors current Web.
4. **"Map rendering" (item 3) is not a parity requirement** — Web has zero map-tile libraries. **Drop from build list.**
5. **"Missing `/api/track` degrades recommendations" (item 6) unsupported** — the recs route doesn't read `user_events`. `/api/track` is still worth wiring for telemetry, but it's P2, not a recs blocker.
6. **Gender + memory `updated_at` labeled BLOCKED** but Web ships both (Supabase metadata / already-returned field) → **shippable, not blocked** (P2-7, P3).
7. **Fortune item 13 understates the gap** — Lifetime + By-Year Tu-vi tabs aren't even listed (P1-8, P1-9).
8. `/api/price-watch` has a **live POST** (doc said GET/DELETE only).
9. Reviews "watch analytics" **overstated** — no `/api/track` call in `reviews/`.
10. `src/lib/finance/**` + `MissingCurrencyError` referenced by 07_Features **does not exist**; `/currency` converts inline with `|| 1` fallbacks (Android correctly mirrors).
11. Backlog "~624 hardcoded VN strings" is a **Web** finding — **Android i18n is strong** (943 default / 941 vi keys); hardcoded tail ≈52 files, mostly fortune content data + the backend `"Chia sẻ"` sentinel.

---

## 6. Proposed sequenced plan (for approval)

Adjusted from the freeze §7 based on §5 corrections. Each item = its own feature cycle (implement → regression → Web-compare → verification report → **your approval** before the next).

**Phase 0 — Unblock the build (prerequisite, not feature work).** P0-1, P0-2: commit the Gradle foundation, add a POSIX `gradlew`, commit the release kit/ADRs, re-derive Play data-safety against the current manifest. *Nothing else can be trusted until a clean checkout builds.*

**Phase 1 — Behavioural parity on shipped features (high value, mostly client-only, low risk).**
`[TAPPY_PLAN]` card (P1-2) → incremental token render (P1-1) → comment replies + reactions (P1-3/4, needs contract) → feed back-restore by clip-ID (P1-5) → video watchdog (P2-3) → music CC-BY + videos grid (P1-11/12, legal first) → `/api/config`-driven limits/flags (P2-9) → suggested-prompts (P2-1).

**Phase 2 — Visible feature gaps (pure client ports).**
Split Bill (P1-10) → Fortune engine: deterministic readings + Lifetime + By-Year + tarot 78 (P1-7/8/9, P2-11) → liked-reviews collection (P2-4).

**Phase 3 — Platform capabilities.**
Location → chat bias / Nearby / For-You (P1-6, P2-2) → FCM push (P1-13) → App Links + `assetlinks.json` (P3) → `/api/track` telemetry (P2-10).

**Phase 4 — Owner-sequenced (backend contract decision first).**
Zalo login (P1-B1) → anonymous tier (P1-B2).

**Opportunistic cleanup / backend hand-offs (fold into adjacent phases).**
Delete `CachedContextEntity`; TTS voice-check fix (P2-12); flag `inferFromBooking()` RLS + gender/`created_at` exposure to the backend owner (P2-13, P2-7).

---

## 7. What I need from you

1. **Approve or amend this gap report** (severities, the §5 corrections, the §6 sequence).
2. **Confirm Phase 0 is mine to do** — it touches the uncommitted working tree and the release kit, so I want explicit go before I `git add` foundation files.
3. **Confirm the per-feature cadence** (implement → verify → your approval → next), and whether you want me to start at the top of Phase 1 once Phase 0 lands, or you'll pick the first feature.

---

## 8. Prod-worktree re-verification (2026-07-26) — corrections to §5

**Why this section exists.** Several §5 "Freeze-doc corrections" were derived by auditors reading the **primary working tree** `src/`, which is *behind* production. The true prod Web source is the git worktree `.claude/worktrees/cool-vaughan-b3c7ff/` (branch `main`, commit `b68be0d`). Web **production** is the source of truth. This re-check compares that PROD worktree against the primary tree. **Root cause confirmed:** the primary tree is missing prod files — e.g. `src/lib/finance/**` and `src/app/api/deals/[id]/click/route.ts` are **absent in primary but present in prod**, while `src/lib/shopee-deals.ts` survives **only in primary** (removed in prod). Every §5 "does not exist in this branch / N/A" claim was therefore suspect and re-checked below. All file:line citations are in the **prod worktree**.

### 8.1 Deals rearchitecture (§5 #3) — **OVERTURNED. Deals is a REAL gap (P1).**
Prod is fully rearchitected around admin-managed `partner_deals`; `shopee-deals.ts` is **gone** in prod (survives only in the stale primary tree).
- **Click endpoint EXISTS:** `POST /api/deals/[id]/click` at `src/app/api/deals/[id]/click/route.ts:11` — atomic +1 via SECURITY DEFINER RPC `increment_deal_click` (best-effort, always 200, never blocks the link).
- **Promo UI is real**, all in `src/app/deals/DealsView.tsx`:
  - Discount badge, rendered only when `discountLabel` present — `:168-172`.
  - `endAt` countdown ("ending soon" / "N days left") via `promoCountdown` from `src/lib/deals/countdown.ts` — `:178-186`.
  - Copyable voucher chip (`navigator.clipboard`, `stopPropagation` so copy never navigates) — `:192-204`.
  - Click-counter fired on card open — `:151` (`fetch('/api/deals/${deal.id}/click', {method:'POST', keepalive:true})`).
- **Public data contract (GET `/api/deals`)** the card consumes: `{ id, partnerName, category, title, description, officialUrl, bannerImage, logoImage, discountLabel, voucherCode, endAt }` — `DealsView.tsx:14-26`.
- **Data layer + admin:** `src/lib/deals/partnerDeals.ts`, `schema.ts`, `countdown.ts`; admin CRUD at `src/app/admin/deals/page.tsx`, `src/app/api/admin/deals/route.ts` (+ `/upload`, `/[id]`).
- **Corrected conclusion:** §5 #3 ("does not exist in this branch; item 10 is N/A; Android correctly mirrors current Web") is **wrong** — it read the stale primary tree. Android's Deals must consume the `partner_deals` GET shape, render discount badge / countdown / voucher-copy chip, and POST the click counter. **Severity: P1** (whole Deals data contract changed + three visible promo affordances + a new endpoint). Exact Android delta depends on whether the client still binds the old shopee model — to be quantified on the Android side, but this is no longer N/A.

### 8.2 Map rendering (§5 #4) — **CONFIRMED. Web has no map-tile library.**
No `leaflet` / `maplibre` / `mapbox` / `react-map-gl` / `@vis.gl` / `google.maps` in `package.json` or anywhere under prod `src/`; no maps page/route renders tiles (grep hits for "openstreetmap" are outbound *links* in `src/lib/ai/tools/travel.ts` & `src/lib/links/platforms.ts`, not a tile substrate). "Web has no map" **holds in prod**; a tiled Android map would exceed parity. §5 #4 stands.

### 8.3 /api/track → recommendations (§5 #5) — **PARTIALLY OVERTURNED (rationale is misleading; severity stays P2).**
Literally, the recs route does not read `user_events` *directly*: `src/app/api/recommendations/route.ts:2` → `buildAIContext` (`src/lib/ai/contextBuilder.ts:33-34`) reads the **cached** `user_preferences.preference_profile`. **But that profile IS built from `user_events`:**
- `/api/track` inserts the event (`src/app/api/track/route.ts:105`) **then rebuilds the profile** (`:111` `rebuildProfile`).
- `rebuildProfile` → `collectSignals` reads `user_events` for `['chat_search','review_share','hide','not_interested','report']` (`src/lib/preferences/signalCollector.ts:50-57`) → `computeWeightedSignals` (`learningEngine.ts:35` consumes `raw.events`) → `buildProfile` → writes `preference_profile` (`profileCache.ts:42-61`).
- **Corrected conclusion:** the §5 #5 phrasing ("recs route doesn't read `user_events`, so missing `/api/track` does not degrade recs") is **misleading**. Android's logging-only `/api/track` means search-derived active interests (`chat_search`) and negative feedback (`hide`/`not_interested`/`report`) **never enter** the recommendation-driving profile → recs **are** degraded for those signals. (Like/save/interact still feed the profile via their own tables + own route rebuilds, which limits the blast radius.) Keep **P2**, but the "does not degrade recs" note should be struck.

### 8.4 src/lib/finance (§5 #10) — **OVERTURNED. Finance lib + `MissingCurrencyError` exist in prod.**
- `src/lib/finance/exchange.ts:5` declares `export class MissingCurrencyError extends Error`; `crossRate` **throws** it when either side lacks a valid rate (`:22-23`). Also `format.ts` (`formatAmount`, `formatRate`) + tests.
- `/currency` uses it: `src/app/currency/page.tsx:9` imports `crossRate, MissingCurrencyError`; conversion catches it (`:95 if (e instanceof MissingCurrencyError)`) — **no silent `|| 1` fallback**.
- Primary tree has **no** `src/lib/finance` dir at all — the source of the §5 #10 error.
- **Corrected conclusion:** §5 #10 ("`src/lib/finance/**` + `MissingCurrencyError` does not exist; `/currency` converts inline with `|| 1` fallbacks; Android correctly mirrors") is **wrong**. Prod converts through the finance lib and surfaces missing-currency explicitly. Android should be re-audited against `crossRate`/`MissingCurrencyError` semantics rather than an inline `|| 1` model.

### 8.5 /api/price-watch methods (§5 #8) — **CONFIRMED + completed.**
`src/app/api/price-watch/route.ts` exposes **GET** (`:5`), **POST** (`:22`), and **DELETE** (`:58`). The original freeze "GET/DELETE only" was wrong; §5 #8 ("has a live POST") is correct. Full set = **GET / POST / DELETE**.

### 8.6 inferFromBooking RLS bug (P2-13) — **CONFIRMED. Bug still present in prod.**
`src/app/api/bookings/route.ts`: the `POST` handler authenticates via the Bearer-aware client (`:31` `const { user, supabase } = await getRequestUser(req)`), but `inferFromBooking()` **ignores it and creates a fresh cookie-scoped client** (`:7` `const supabase = createClient()` from `@/lib/supabase/server`). For native Bearer callers there is no auth cookie, so the `user_preferences` upsert (`:18-23`) is **RLS-blocked and swallowed** (`:24-25 catch { console.error }`). Personalization from bookings is silently lost for Android/iOS. **P2-13 stands as a genuine backend bug.**

### 8.7 Other spot-checks (§5 #7)
The systemic issue is that **any §5 conclusion sourced from the primary tree is unreliable.** Confirmed prod-vs-primary divergences found here: `src/lib/finance/**` (prod-only), the `partner_deals` deals stack incl. the click route (prod-only), and `src/lib/shopee-deals.ts` (primary-only / removed in prod). The remaining §5 items that are **Android-source** findings (#1 render-vs-transport streaming, #2 `/api/config` onboarding consumption, #9 no `/api/track` in `reviews/`) were not affected by the stale-web-tree issue and are not re-litigated here. Net: of the web-sourced §5 corrections, **#3 and #10 are overturned, #5's rationale is corrected, #4 and #8 hold.**
